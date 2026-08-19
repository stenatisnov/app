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
    // "first-primary" pins a session's first query to D1's primary and every
    // later query on that *same* session to a replica at least as fresh — without
    // it, reads can hit a lagging replica and silently see none of the rows a
    // query moments earlier just wrote/observed. That guarantee only holds for
    // queries actually issued in sequence on one session; the 7 jobs below run
    // concurrently (fired via separate ctx.waitUntil calls, none awaited before
    // the next starts), so sharing a single session only pinned whichever job's
    // query happened to reach D1 first — not the other 6. Each job gets its own
    // session so each one's *own* first query is the one that's pinned. Bit us
    // as the transaction backup job intermittently exporting an empty log
    // despite matching rows existing, even after the first attempt at this fix
    // (confirmed via the audit log: the whole scheduled() tick that produced an
    // empty export logged nothing at all that minute, for any of the 7 jobs —
    // consistent with several jobs racing D1 reads on one shared session).
    const freshPrisma = () => {
      const session = env.DB.withSession("first-primary");
      const adapter = new PrismaD1(session as unknown as D1Database);
      return new PrismaClient({ adapter });
    };
    ctx.waitUntil(runConfigBackupIfDue(freshPrisma()));
    ctx.waitUntil(runTransactionBackupIfDue(freshPrisma()));
    ctx.waitUntil(runDatabaseDumpIfDue(freshPrisma()));
    ctx.waitUntil(runLogCleanupIfDue(freshPrisma()));
    ctx.waitUntil(runPendingOrderCleanupIfDue(freshPrisma()));
    ctx.waitUntil(runEmailVerificationSuspensionIfDue(freshPrisma()));
    ctx.waitUntil(runFioPollIfDue(freshPrisma()));
  },
} satisfies ExportedHandler<Env>;
