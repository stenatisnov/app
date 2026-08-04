import type { PrismaClient } from "@prisma/client";
import { audit } from "./audit";
import { exportDataToYaml } from "./data-transfer";
import { exportTransactionLogToYaml } from "./transaction-log";
import {
  getConfigBackupSettingsStored,
  getS3SettingsStored,
  getTransactionBackupSettingsStored,
  setSetting,
  type ConfigBackupSettings,
  type S3Settings,
  type TransactionBackupSettings,
} from "./settings";
import { s3DeleteObject, s3ListObjectKeys, s3PutObject } from "./s3";

function backupKey(path: string, date: Date): string {
  const stamp = date.toISOString().replace(/[:.]/g, "-"); // e.g. 2026-08-04T12-30-45-123Z
  return `${path}backup-${stamp}.yaml`;
}

async function pruneOldBackups(s3Config: S3Settings, path: string, keepCount: number): Promise<void> {
  const keys = (await s3ListObjectKeys(s3Config, path)).sort();
  const toDelete = keys.slice(0, Math.max(0, keys.length - Math.max(0, keepCount)));
  for (const key of toDelete) {
    await s3DeleteObject(s3Config, key);
  }
}

/**
 * Runs the YAML export + S3 upload + old-backup pruning if `frequencyMinutes`
 * has elapsed since the last successful run (or always, when `force` is set
 * — the admin's "back up now" button). Safe to call frequently (e.g. every
 * minute from a cron/interval) — it no-ops until actually due, which lets
 * the admin-configured frequency take effect without redeploying any
 * platform-level schedule.
 */
export async function runConfigBackupIfDue(prisma: PrismaClient, opts: { force?: boolean } = {}): Promise<void> {
  const s3 = await getS3SettingsStored(prisma);
  const settings = await getConfigBackupSettingsStored(prisma);
  if (!s3.bucket || !s3.accessKeyId || !s3.secretAccessKey) {
    if (opts.force) throw new Error("S3_NOT_CONFIGURED");
    return;
  }
  if (!opts.force && !settings.enabled) return;

  const frequencyMs = Math.max(1, settings.frequencyMinutes) * 60_000;
  const now = new Date();
  if (!opts.force && settings.lastRunAt && now.getTime() - new Date(settings.lastRunAt).getTime() < frequencyMs) return;

  try {
    const yamlText = await exportDataToYaml(prisma);
    const key = backupKey(settings.path, now);
    await s3PutObject(s3, key, new TextEncoder().encode(yamlText), "application/yaml; charset=utf-8");
    await pruneOldBackups(s3, settings.path, settings.keepCount);

    const next: ConfigBackupSettings = { ...settings, lastRunAt: now.toISOString(), lastError: "", lastErrorAt: "" };
    await setSetting("backup", next, prisma);
    await audit({ action: "admin.backup.run", success: true, meta: { kind: "config", key, bucket: s3.bucket } }, prisma);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const next: ConfigBackupSettings = { ...settings, lastError: message, lastErrorAt: now.toISOString() };
    await setSetting("backup", next, prisma);
    await audit({ action: "admin.backup.run", success: false, message, meta: { kind: "config", bucket: s3.bucket } }, prisma);
    throw err;
  }
}

/**
 * Same shape as `runConfigBackupIfDue`, but for the transaction log: the
 * YAML is regenerated fresh from `PaymentOrder`/`CreditLedger`/`AuditLog`
 * every run (see `exportTransactionLogToYaml`), scoped to the trailing
 * `retentionDays` window — so unlike a real append-only file, there's
 * nothing to prune locally, only old *backups* in the bucket (by `keepCount`,
 * same as the config job).
 */
export async function runTransactionBackupIfDue(prisma: PrismaClient, opts: { force?: boolean } = {}): Promise<void> {
  const s3 = await getS3SettingsStored(prisma);
  const settings = await getTransactionBackupSettingsStored(prisma);
  if (!s3.bucket || !s3.accessKeyId || !s3.secretAccessKey) {
    if (opts.force) throw new Error("S3_NOT_CONFIGURED");
    return;
  }
  if (!opts.force && !settings.enabled) return;

  const frequencyMs = Math.max(1, settings.frequencyMinutes) * 60_000;
  const now = new Date();
  if (!opts.force && settings.lastRunAt && now.getTime() - new Date(settings.lastRunAt).getTime() < frequencyMs) return;

  try {
    const sinceDate = new Date(now.getTime() - Math.max(1, settings.retentionDays) * 86_400_000);
    const yamlText = await exportTransactionLogToYaml(prisma, sinceDate);
    const key = backupKey(settings.path, now);
    await s3PutObject(s3, key, new TextEncoder().encode(yamlText), "application/yaml; charset=utf-8");
    await pruneOldBackups(s3, settings.path, settings.keepCount);

    const next: TransactionBackupSettings = { ...settings, lastRunAt: now.toISOString(), lastError: "", lastErrorAt: "" };
    await setSetting("transactionBackup", next, prisma);
    await audit({ action: "admin.backup.run", success: true, meta: { kind: "transactions", key, bucket: s3.bucket } }, prisma);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const next: TransactionBackupSettings = { ...settings, lastError: message, lastErrorAt: now.toISOString() };
    await setSetting("transactionBackup", next, prisma);
    await audit(
      { action: "admin.backup.run", success: false, message, meta: { kind: "transactions", bucket: s3.bucket } },
      prisma,
    );
    throw err;
  }
}
