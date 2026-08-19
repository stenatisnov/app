/**
 * Cloudflare Workers entry — @cloudflare/vite-plugin's own Workers
 * integration, not OpenNext (that's Next.js-only, see the Next.js D1
 * branches' `worker.ts` for the equivalent there). Also carries a
 * `scheduled` handler for the periodic S3 backup jobs (config
 * export, transaction log, and SQL database dump), the audit-log/pending-
 * order cleanup jobs, the email-verification suspension sweep, and the Fio
 * bank API payment poll.
 *
 * Cron Triggers only support fixed schedules, but each job's frequency is
 * admin-configurable at runtime — so this fires every minute (the finest
 * granularity Cloudflare allows) and `runConfigBackupIfDue`/
 * `runTransactionBackupIfDue`/`runDatabaseDumpIfDue`/`runLogCleanupIfDue`/
 * `runPendingOrderCleanupIfDue`/`runEmailVerificationSuspensionIfDue`/
 * `runFioPollIfDue` themselves decide whether they're actually due. See
 * `wrangler.jsonc`'s `triggers.crons`.
 *
 * Deliberately doesn't reuse `src/lib/db.ts`'s `getPrisma()`: that goes
 * through `getLoadContext()`, populated only for the request lifecycle
 * `withLoadContext` wraps a loader/action in — never entered by a
 * `scheduled` invocation. The D1 binding is built directly from the `env`
 * Cloudflare hands to `scheduled` instead, the same way `db.ts` itself
 * does deeper down.
 */
import { createRequestHandler } from "react-router";
// Explicit `/wasm` entry point — see the matching comment in `src/lib/db.ts`.
import { PrismaClient } from "@prisma/client/wasm";
import { PrismaD1 } from "@prisma/adapter-d1";
import { runConfigBackupIfDue, runDatabaseDumpIfDue, runTransactionBackupIfDue } from "../src/lib/backup";
import { runLogCleanupIfDue } from "../src/lib/log-cleanup";
import { runPendingOrderCleanupIfDue } from "../src/lib/pending-order-cleanup";
import { runEmailVerificationSuspensionIfDue } from "../src/lib/email-verification";
import { runFioPollIfDue } from "../src/lib/fio";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    return requestHandler(request, { cloudflare: { env, ctx } });
  },
  async scheduled(_event, env, ctx) {
    // "first-primary" pins this session's first query to D1's primary and every
    // later query to a replica at least as fresh — without it, reads can hit a
    // lagging replica and silently see none of the rows a query moments earlier
    // (from a different session) just wrote/observed. Bit us as the transaction
    // backup job intermittently exporting an empty log despite matching rows
    // existing (bisected via `wrangler tail` + `wrangler deployments list`: same
    // single deployed version, no other cron/worker involved, so not code —
    // this is the documented fix for read-your-writes D1 consistency).
    const session = env.DB.withSession("first-primary");
    const adapter = new PrismaD1(session as unknown as D1Database);
    const prisma = new PrismaClient({ adapter });
    ctx.waitUntil(runConfigBackupIfDue(prisma));
    ctx.waitUntil(runTransactionBackupIfDue(prisma));
    ctx.waitUntil(runDatabaseDumpIfDue(prisma));
    ctx.waitUntil(runLogCleanupIfDue(prisma));
    ctx.waitUntil(runPendingOrderCleanupIfDue(prisma));
    ctx.waitUntil(runEmailVerificationSuspensionIfDue(prisma));
    ctx.waitUntil(runFioPollIfDue(prisma));
  },
} satisfies ExportedHandler<Env>;
