import type { PrismaClient } from "@prisma/client";
import { audit } from "./audit";
import { isDueOnDailySchedule } from "./schedule";
import { getLogCleanupSettingsStored, setSetting, type LogCleanupSettings } from "./settings";

/**
 * Deletes `AuditLog` rows older than `maxAgeDays` — the audit trail is
 * append-only and has no built-in retention on its own, so left alone it
 * grows forever. Runs at most once a day at the configured `timeOfDay`,
 * same schedule shape as the SQL database dump backup (see
 * `isDueOnDailySchedule`), not S3-related at all so it doesn't need the
 * shared S3 connection settings.
 */
export async function runLogCleanupIfDue(prisma: PrismaClient, opts: { force?: boolean } = {}): Promise<void> {
  const settings = await getLogCleanupSettingsStored(prisma);
  if (!opts.force && !settings.enabled) return;

  const now = new Date();
  if (!opts.force && !isDueOnDailySchedule(settings, now)) return;

  try {
    const cutoff = new Date(now.getTime() - Math.max(1, settings.maxAgeDays) * 86_400_000);
    const { count } = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });

    const next: LogCleanupSettings = {
      ...settings,
      lastRunAt: now.toISOString(),
      lastDeletedCount: count,
      lastError: "",
      lastErrorAt: "",
    };
    await setSetting("logCleanup", next, prisma);
    await audit({ action: "admin.logs.cleanup", success: true, meta: { deletedCount: count } }, prisma);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const next: LogCleanupSettings = { ...settings, lastError: message, lastErrorAt: now.toISOString() };
    await setSetting("logCleanup", next, prisma);
    await audit({ action: "admin.logs.cleanup", success: false, message }, prisma);
    throw err;
  }
}
