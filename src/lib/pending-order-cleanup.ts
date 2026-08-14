import type { PrismaClient } from "@prisma/client";
import { audit } from "./audit";
import { getPendingOrderCleanupSettingsStored, setSetting, type PendingOrderCleanupSettings } from "./settings";

/**
 * Deletes `PaymentOrder` rows still `PENDING` after `maxAgeHours` — orders a
 * member started (QR/GoPay) but never finished or that were never manually
 * confirmed otherwise pile up forever. Runs on a plain `frequencyHours`
 * interval since the last run (the Fio-poll shape), not the fixed
 * time-of-day schedule the daily jobs use — an interval shorter than a day
 * can't honour a time-of-day anchor.
 */
export async function runPendingOrderCleanupIfDue(prisma: PrismaClient, opts: { force?: boolean } = {}): Promise<void> {
  const settings = await getPendingOrderCleanupSettingsStored(prisma);
  if (!opts.force && !settings.enabled) return;

  const now = new Date();
  const frequencyMs = Math.max(1, settings.frequencyHours) * 3_600_000;
  if (!opts.force && settings.lastRunAt && now.getTime() - new Date(settings.lastRunAt).getTime() < frequencyMs) return;

  try {
    const cutoff = new Date(now.getTime() - Math.max(1, settings.maxAgeHours) * 3_600_000);
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
