import { prisma } from "./db";
import { runConfigBackupIfDue, runDatabaseDumpIfDue, runTransactionBackupIfDue } from "./backup";
import { runLogCleanupIfDue } from "./log-cleanup";
import { runPendingOrderCleanupIfDue } from "./pending-order-cleanup";
import { runFioPollIfDue } from "./fio";

const POLL_INTERVAL_MS = 60_000;
let started = false;

/**
 * In-process poller for the Node.js-hosted branches (libsql, libsql-local)
 * — checks every minute and no-ops until each job's admin-configured
 * frequency has actually elapsed, so changing it in the admin UI takes
 * effect without restarting the server. Covers the S3 backup jobs, audit
 * log cleanup, pending payment order cleanup, and the Fio bank API payment
 * poll. Not used on the
 * Cloudflare Workers branch: Workers isolates aren't a persistent process,
 * so that branch uses a real Cron Trigger instead (see `worker.ts`).
 */
export function startBackupScheduler() {
  if (started) return;
  started = true;

  const tick = () => {
    runConfigBackupIfDue(prisma).catch((err) => {
      console.error("Scheduled config backup failed:", err);
    });
    runTransactionBackupIfDue(prisma).catch((err) => {
      console.error("Scheduled transaction backup failed:", err);
    });
    runDatabaseDumpIfDue(prisma).catch((err) => {
      console.error("Scheduled database dump failed:", err);
    });
    runLogCleanupIfDue(prisma).catch((err) => {
      console.error("Scheduled log cleanup failed:", err);
    });
    runPendingOrderCleanupIfDue(prisma).catch((err) => {
      console.error("Scheduled pending order cleanup failed:", err);
    });
    runFioPollIfDue(prisma).catch((err) => {
      console.error("Scheduled Fio payment poll failed:", err);
    });
  };

  tick();
  setInterval(tick, POLL_INTERVAL_MS);
}
