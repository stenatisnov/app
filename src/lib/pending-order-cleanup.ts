import type { PrismaClient } from "@prisma/client";
import { audit } from "./audit";
import { isDueOnDailySchedule } from "./schedule";
import { getPendingOrderCleanupSettingsStored, setSetting, type PendingOrderCleanupSettings } from "./settings";

/**
 * Deletes `PaymentOrder` rows still `PENDING` after `maxAgeDays` — orders a
 * member started (QR/GoPay) but never finished or that were never manually
 * confirmed otherwise pile up forever. Same once-a-day-at-`timeOfDay`
 * schedule shape as the audit log cleanup (see `isDueOnDailySchedule`).
 */
export async function runPendingOrderCleanupIfDue(prisma: PrismaClient, opts: { force?: boolean } = {}): Promise<void> {
  const settings = await getPendingOrderCleanupSettingsStored(prisma);
  if (!opts.force && !settings.enabled) return;

  const now = new Date();
  if (!opts.force && !isDueOnDailySchedule(settings, now)) return;

  try {
    const cutoff = new Date(now.getTime() - Math.max(1, settings.maxAgeDays) * 86_400_000);
    const { count } = await prisma.paymentOrder.deleteMany({
      where: { status: "PENDING", createdAt: { lt: cutoff } },
    });

    const next: PendingOrderCleanupSettings = {
      ...settings,
      lastRunAt: now.toISOString(),
      lastDeletedCount: count,
      lastError: "",
      lastErrorAt: "",
    };
    await setSetting("pendingOrderCleanup", next, prisma);
    await audit({ action: "admin.payments.cleanup", success: true, meta: { deletedCount: count } }, prisma);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const next: PendingOrderCleanupSettings = { ...settings, lastError: message, lastErrorAt: now.toISOString() };
    await setSetting("pendingOrderCleanup", next, prisma);
    await audit({ action: "admin.payments.cleanup", success: false, message }, prisma);
    throw err;
  }
}
