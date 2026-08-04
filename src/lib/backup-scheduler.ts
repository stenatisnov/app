import { prisma } from "./db";
import { runConfigBackupIfDue, runTransactionBackupIfDue } from "./backup";

const POLL_INTERVAL_MS = 60_000;
let started = false;

/**
 * In-process backup poller for the Node.js-hosted branches (libsql,
 * libsql-local) — checks every minute and no-ops until the admin-configured
 * frequency has actually elapsed, so changing the frequency in the admin UI
 * takes effect without restarting the server. Not used on the Cloudflare
 * Workers branch: Workers isolates aren't a persistent process, so that
 * branch uses a real Cron Trigger instead (see `worker.ts`).
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
  };

  tick();
  setInterval(tick, POLL_INTERVAL_MS);
}
