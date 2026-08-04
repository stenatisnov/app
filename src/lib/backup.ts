import type { PrismaClient } from "@prisma/client";
import { audit } from "./audit";
import { exportDataToYaml } from "./data-transfer";
import { exportTransactionLogToYaml } from "./transaction-log";
import { exportDatabaseDumpToSql } from "./db-dump";
import {
  getConfigBackupSettingsStored,
  getDatabaseDumpSettingsStored,
  getS3SettingsStored,
  getTransactionBackupSettingsStored,
  setSetting,
  type ConfigBackupSettings,
  type DatabaseDumpSettings,
  type S3Settings,
  type TransactionBackupSettings,
} from "./settings";
import { s3DeleteObject, s3ListObjectKeys, s3PutObject } from "./s3";

function backupKey(path: string, date: Date, ext: string): string {
  const stamp = date.toISOString().replace(/[:.]/g, "-"); // e.g. 2026-08-04T12-30-45-123Z
  return `${path}backup-${stamp}.${ext}`;
}

/**
 * Unlike the other two jobs (fire every `frequencyMinutes`), the DB dump
 * runs at most once per day, at a fixed clock time — "due" means today's
 * `timeOfDay` has passed AND at least `frequencyDays` whole days have
 * elapsed since the last run (measured at that same time-of-day, so a run
 * that happens a few minutes late one day doesn't shift the schedule).
 */
function isDatabaseDumpDue(settings: DatabaseDumpSettings, now: Date): boolean {
  const [hh, mm] = settings.timeOfDay.split(":").map(Number);
  const scheduledToday = new Date(now);
  scheduledToday.setHours(hh || 0, mm || 0, 0, 0);
  if (now < scheduledToday) return false;
  if (!settings.lastRunAt) return true;

  const lastRunAtScheduledTime = new Date(settings.lastRunAt);
  lastRunAtScheduledTime.setHours(hh || 0, mm || 0, 0, 0);
  const daysSince = Math.round((scheduledToday.getTime() - lastRunAtScheduledTime.getTime()) / 86_400_000);
  return daysSince >= Math.max(1, settings.frequencyDays);
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
    const key = backupKey(settings.path, now, "yaml");
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
    const key = backupKey(settings.path, now, "yaml");
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

/**
 * A real "restore the database" backup — every row of every table, as raw
 * SQL `INSERT` statements (see `exportDatabaseDumpToSql`). Runs at most
 * once a day at the configured `timeOfDay`, not on a `frequencyMinutes`
 * poll like the other two jobs — see `isDatabaseDumpDue`.
 */
export async function runDatabaseDumpIfDue(prisma: PrismaClient, opts: { force?: boolean } = {}): Promise<void> {
  const s3 = await getS3SettingsStored(prisma);
  const settings = await getDatabaseDumpSettingsStored(prisma);
  if (!s3.bucket || !s3.accessKeyId || !s3.secretAccessKey) {
    if (opts.force) throw new Error("S3_NOT_CONFIGURED");
    return;
  }
  if (!opts.force && !settings.enabled) return;

  const now = new Date();
  if (!opts.force && !isDatabaseDumpDue(settings, now)) return;

  try {
    const sqlText = await exportDatabaseDumpToSql(prisma);
    const key = backupKey(settings.path, now, "sql");
    await s3PutObject(s3, key, new TextEncoder().encode(sqlText), "application/sql; charset=utf-8");
    await pruneOldBackups(s3, settings.path, settings.keepCount);

    const next: DatabaseDumpSettings = { ...settings, lastRunAt: now.toISOString(), lastError: "", lastErrorAt: "" };
    await setSetting("databaseDump", next, prisma);
    await audit({ action: "admin.backup.run", success: true, meta: { kind: "database", key, bucket: s3.bucket } }, prisma);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const next: DatabaseDumpSettings = { ...settings, lastError: message, lastErrorAt: now.toISOString() };
    await setSetting("databaseDump", next, prisma);
    await audit(
      { action: "admin.backup.run", success: false, message, meta: { kind: "database", bucket: s3.bucket } },
      prisma,
    );
    throw err;
  }
}
