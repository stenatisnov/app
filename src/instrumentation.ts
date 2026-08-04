/**
 * Next.js calls `register()` once per server process on startup. Used here
 * to start the in-process backup poller on the Node.js-hosted branches.
 * Deliberately excluded from the Cloudflare Workers runtime (detected via
 * the standard `navigator.userAgent` check) — Workers isolates aren't a
 * persistent process, so `setInterval` there isn't reliable; that branch's
 * `worker.ts` wires a real Cron Trigger to the same `runBackupIfDue` job.
 */
export async function register() {
  const isCloudflareWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
  if (process.env.NEXT_RUNTIME === "nodejs" && !isCloudflareWorkers) {
    const { startBackupScheduler } = await import("@/lib/backup-scheduler");
    startBackupScheduler();
  }
}
