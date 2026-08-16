#!/usr/bin/env -S npx tsx
/**
 * In-process poller for the periodic S3 backup jobs (config export,
 * transaction log, SQL database dump), audit-log cleanup, pending-order
 * cleanup, unverified-account suspension, and the Fio bank API payment
 * poll — checks every minute and no-ops until each job's admin-configured
 * frequency has actually elapsed, so changing it in the admin UI takes
 * effect without restarting anything.
 *
 * React Router (unlike Next.js) has no `instrumentation.ts`-style
 * "run once when the server process starts" hook, so this runs as its own
 * standalone process instead — started by `docker-entrypoint.sh` alongside
 * `npm run start`, not imported by the app itself. Same reason
 * `prisma/seed.ts` builds its own client rather than importing `@/lib/db`:
 * this runs via `tsx`, outside the app's own Vite/module resolution, so
 * imports here are relative, not through the `@/` alias.
 *
 * Not used on the Cloudflare Workers branch — Workers isolates aren't a
 * persistent process, so that branch uses a real Cron Trigger instead
 * (see `workers/app.ts` there).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { runConfigBackupIfDue, runDatabaseDumpIfDue, runTransactionBackupIfDue } from "../src/lib/backup";
import { runLogCleanupIfDue } from "../src/lib/log-cleanup";
import { runPendingOrderCleanupIfDue } from "../src/lib/pending-order-cleanup";
import { runEmailVerificationSuspensionIfDue } from "../src/lib/email-verification";
import { runFioPollIfDue } from "../src/lib/fio";

const POLL_INTERVAL_MS = 60_000;
const prisma = new PrismaClient();

function tick() {
  runConfigBackupIfDue(prisma).catch((err) => console.error("Scheduled config backup failed:", err));
  runTransactionBackupIfDue(prisma).catch((err) => console.error("Scheduled transaction backup failed:", err));
  runDatabaseDumpIfDue(prisma).catch((err) => console.error("Scheduled database dump failed:", err));
  runLogCleanupIfDue(prisma).catch((err) => console.error("Scheduled log cleanup failed:", err));
  runPendingOrderCleanupIfDue(prisma).catch((err) => console.error("Scheduled pending order cleanup failed:", err));
  runEmailVerificationSuspensionIfDue(prisma).catch((err) => console.error("Scheduled email verification suspension failed:", err));
  runFioPollIfDue(prisma).catch((err) => console.error("Scheduled Fio payment poll failed:", err));
}

console.log("[scheduler] started, polling every", POLL_INTERVAL_MS / 1000, "s");
tick();
setInterval(tick, POLL_INTERVAL_MS);
