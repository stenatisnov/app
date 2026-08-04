import type { PrismaClient } from "@prisma/client";
import { audit } from "./audit";
import { exportDataToYaml } from "./data-transfer";
import { getBackupSettingsStored, setSetting, type BackupSettings } from "./settings";
import { s3DeleteObject, s3ListObjectKeys, s3PutObject } from "./s3";

const KEEP_COUNT = 10;

function backupKey(path: string, date: Date): string {
  const stamp = date.toISOString().replace(/[:.]/g, "-"); // e.g. 2026-08-04T12-30-45-123Z
  return `${path}backup-${stamp}.yaml`;
}

/**
 * Runs the YAML export + S3 upload + old-backup pruning if `frequencyMinutes`
 * has elapsed since the last successful run. Safe to call frequently (e.g.
 * every minute from a cron/interval) — it no-ops until actually due, which
 * lets the admin-configured frequency take effect without redeploying any
 * platform-level schedule.
 */
export async function runBackupIfDue(prisma: PrismaClient): Promise<void> {
  const settings = await getBackupSettingsStored(prisma);
  if (!settings.enabled || !settings.bucket || !settings.accessKeyId || !settings.secretAccessKey) return;

  const frequencyMs = Math.max(1, settings.frequencyMinutes) * 60_000;
  const now = new Date();
  if (settings.lastRunAt && now.getTime() - new Date(settings.lastRunAt).getTime() < frequencyMs) return;

  const s3Config = {
    bucket: settings.bucket,
    region: settings.region,
    endpoint: settings.endpoint,
    accessKeyId: settings.accessKeyId,
    secretAccessKey: settings.secretAccessKey,
  };

  try {
    const yamlText = await exportDataToYaml(prisma);
    const key = backupKey(settings.path, now);
    await s3PutObject(s3Config, key, new TextEncoder().encode(yamlText), "application/yaml; charset=utf-8");
    await pruneOldBackups(s3Config, settings.path);

    const next: BackupSettings = { ...settings, lastRunAt: now.toISOString(), lastError: "", lastErrorAt: "" };
    await setSetting("backup", next, prisma);
    await audit({ action: "admin.backup.run", success: true, meta: { key, bucket: settings.bucket } }, prisma);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const next: BackupSettings = { ...settings, lastError: message, lastErrorAt: now.toISOString() };
    await setSetting("backup", next, prisma);
    await audit({ action: "admin.backup.run", success: false, message, meta: { bucket: settings.bucket } }, prisma);
    throw err;
  }
}

async function pruneOldBackups(s3Config: Parameters<typeof s3ListObjectKeys>[0], path: string): Promise<void> {
  const keys = (await s3ListObjectKeys(s3Config, path)).sort();
  const toDelete = keys.slice(0, Math.max(0, keys.length - KEEP_COUNT));
  for (const key of toDelete) {
    await s3DeleteObject(s3Config, key);
  }
}
