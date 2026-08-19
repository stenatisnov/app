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
    // Each job gets its own D1 session (session pinning only protects queries
    // actually issued in sequence on the *same* session — sharing one across
    // jobs defeats that). And the 7 jobs run sequentially, not fired
    // concurrently via separate ctx.waitUntil calls: bursting all of them at
    // once occasionally cut the whole tick short partway through (confirmed
    // via the audit log — a tick that wrote a backup file logged nothing at
    // all for any of the 7 jobs that minute). Running one at a time spreads
    // the D1/network load out, and means a cutoff loses only the jobs after
    // whichever one was running, not everything. Each job already records
    // its own success/failure via setSetting+audit internally, so a rejected
    // one is swallowed here rather than skipping the rest of the list.
    const freshPrisma = () => {
      const session = env.DB.withSession("first-primary");
      const adapter = new PrismaD1(session as unknown as D1Database);
      return new PrismaClient({ adapter });
    };
    const jobs = [
      () => runConfigBackupIfDue(freshPrisma()),
      () => runTransactionBackupIfDue(freshPrisma()),
      () => runDatabaseDumpIfDue(freshPrisma()),
      () => runLogCleanupIfDue(freshPrisma()),
      () => runPendingOrderCleanupIfDue(freshPrisma()),
      () => runEmailVerificationSuspensionIfDue(freshPrisma()),
      () => runFioPollIfDue(freshPrisma()),
    ];
    ctx.waitUntil(
      (async () => {
        for (const job of jobs) {
          await job().catch(() => {});
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
