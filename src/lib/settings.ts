import type { PrismaClient } from "@prisma/client";
import { prisma } from "./db";

export type LockSettings = {
  url: string;
  token: string;
  method: string;
  openDurationSec: number;
  cooldownSec: number;
  timeoutMs: number;
};

export type QrPaymentSettings = {
  accountNumber: string;
  bankCode: string;
  messageTemplate: string;
  vsPrefix: string;
};

export type GoPaySettings = {
  goid: string;
  clientId: string;
  clientSecret: string;
  sandbox: boolean;
};

export type SmtpSettings = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

/** S3-compatible connection shared by both backup jobs below. */
export type S3Settings = {
  bucket: string;
  region: string;
  /** Custom S3-compatible endpoint host (e.g. an R2/MinIO/Spaces host); empty = AWS S3. */
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type ConfigBackupSettings = {
  enabled: boolean;
  /** Object-key prefix ("directory") backups are stored under within the bucket. Always ends in "/" once normalized, or is "". */
  path: string;
  frequencyMinutes: number;
  /** How many of the newest timestamped backups to keep in the bucket; older ones are pruned on each run. */
  keepCount: number;
  /** ISO instant of the last successful backup, or "" if none yet. */
  lastRunAt: string;
  /** Message from the most recent failed attempt, or "" if the last attempt succeeded. */
  lastError: string;
  lastErrorAt: string;
};

export type TransactionBackupSettings = {
  enabled: boolean;
  path: string;
  frequencyMinutes: number;
  keepCount: number;
  /** How many trailing days of transaction history the exported log (and thus each backup) contains. */
  retentionDays: number;
  lastRunAt: string;
  lastError: string;
  lastErrorAt: string;
};

export type DatabaseDumpSettings = {
  enabled: boolean;
  path: string;
  /** How many days between dumps (not minutes, unlike the other two backup jobs — this one runs on a daily-or-sparser cadence at a fixed clock time). */
  frequencyDays: number;
  /** 24h "HH:MM" — the dump only fires at/after this time on a day it's due. */
  timeOfDay: string;
  keepCount: number;
  lastRunAt: string;
  lastError: string;
  lastErrorAt: string;
};

export type LogCleanupSettings = {
  enabled: boolean;
  /** Delete AuditLog rows older than this many days. */
  maxAgeDays: number;
  timeOfDay: string;
  frequencyDays: number;
  lastRunAt: string;
  /** How many rows the last successful run deleted. */
  lastDeletedCount: number;
  lastError: string;
  lastErrorAt: string;
};

const LOCK_DEFAULT: LockSettings = {
  url: "",
  token: "",
  method: "POST",
  openDurationSec: 5,
  cooldownSec: 60,
  timeoutMs: 5000,
};

const QR_PAYMENT_DEFAULT: QrPaymentSettings = {
  accountNumber: "",
  bankCode: "",
  messageTemplate: "Stena Letnak {vs}",
  vsPrefix: "1",
};

const GOPAY_DEFAULT: GoPaySettings = {
  goid: "",
  clientId: "",
  clientSecret: "",
  sandbox: true,
};

const SMTP_DEFAULT: SmtpSettings = {
  host: "",
  port: 587,
  user: "",
  pass: "",
  from: "",
};

const S3_DEFAULT: S3Settings = {
  bucket: "",
  region: "us-east-1",
  endpoint: "",
  accessKeyId: "",
  secretAccessKey: "",
};

const CONFIG_BACKUP_DEFAULT: ConfigBackupSettings = {
  enabled: false,
  path: "stena-letnak-backups/",
  frequencyMinutes: 60,
  keepCount: 10,
  lastRunAt: "",
  lastError: "",
  lastErrorAt: "",
};

const TRANSACTION_BACKUP_DEFAULT: TransactionBackupSettings = {
  enabled: false,
  path: "stena-letnak-transactions/",
  frequencyMinutes: 60,
  keepCount: 10,
  retentionDays: 90,
  lastRunAt: "",
  lastError: "",
  lastErrorAt: "",
};

const DATABASE_DUMP_DEFAULT: DatabaseDumpSettings = {
  enabled: false,
  path: "stena-letnak-db-dumps/",
  frequencyDays: 1,
  timeOfDay: "03:00",
  keepCount: 7,
  lastRunAt: "",
  lastError: "",
  lastErrorAt: "",
};

const LOG_CLEANUP_DEFAULT: LogCleanupSettings = {
  enabled: false,
  maxAgeDays: 90,
  timeOfDay: "03:30",
  frequencyDays: 1,
  lastRunAt: "",
  lastDeletedCount: 0,
  lastError: "",
  lastErrorAt: "",
};

/**
 * Reads a JSON-valued setting row, falling back to defaults for missing
 * keys. Accepts an explicit `client` for callers that already have their
 * own Prisma client and can't rely on this module's own resolution — e.g.
 * the D1 branch's scheduled backup job, which runs outside the fetch
 * request lifecycle `getPrisma()` depends on there.
 */
export async function getSetting<T extends object>(key: string, fallback: T, client: PrismaClient = prisma): Promise<T> {
  const row = await client.appSetting.findUnique({ where: { key } });
  if (!row) return fallback;
  return { ...fallback, ...(row.value as object) } as T;
}

export async function setSetting(key: string, value: unknown, client: PrismaClient = prisma) {
  await client.appSetting.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  });
}

export function getLockSettings() {
  return getSetting("lock", LOCK_DEFAULT);
}

export function getQrPaymentSettings() {
  return getSetting("qrPayment", QR_PAYMENT_DEFAULT);
}

/** Values as stored in the DB, for prefilling the admin settings form. */
export function getGoPaySettingsStored() {
  return getSetting("gopay", GOPAY_DEFAULT);
}

/**
 * Effective GoPay config for runtime use: environment variables take
 * precedence over the admin-configured values. Use `getGoPaySettingsStored`
 * instead when rendering the admin form itself.
 */
export async function getGoPaySettings(): Promise<GoPaySettings> {
  const stored = await getGoPaySettingsStored();
  return {
    goid: process.env.GOPAY_GOID || stored.goid,
    clientId: process.env.GOPAY_CLIENT_ID || stored.clientId,
    clientSecret: process.env.GOPAY_CLIENT_SECRET || stored.clientSecret,
    sandbox: process.env.GOPAY_SANDBOX ? process.env.GOPAY_SANDBOX === "true" : stored.sandbox,
  };
}

/** Which GoPay fields are pinned by env vars — used to gray out those form fields. */
export function goPayEnvOverrides() {
  return {
    goid: Boolean(process.env.GOPAY_GOID),
    clientId: Boolean(process.env.GOPAY_CLIENT_ID),
    clientSecret: Boolean(process.env.GOPAY_CLIENT_SECRET),
    sandbox: process.env.GOPAY_SANDBOX !== undefined && process.env.GOPAY_SANDBOX !== "",
  };
}

/**
 * S3 connection shared by the config and transaction-log backup jobs. Kept
 * under its own "s3" key so both jobs (and their admin forms) reference one
 * set of credentials instead of duplicating bucket/region/keys.
 *
 * Before this connection settings split existed, those fields lived
 * directly on the "backup" row. If "s3" hasn't been saved yet, fall back to
 * reading them from there once, so an already-configured bucket keeps
 * working until the admin re-saves the (now separate) S3 form.
 */
export async function getS3SettingsStored(client?: PrismaClient): Promise<S3Settings> {
  const stored = await getSetting("s3", S3_DEFAULT, client);
  if (stored.bucket || stored.accessKeyId) return stored;
  const legacy = await getSetting("backup", S3_DEFAULT, client);
  if (!legacy.bucket && !legacy.accessKeyId) return stored;
  return {
    bucket: legacy.bucket,
    region: legacy.region,
    endpoint: legacy.endpoint,
    accessKeyId: legacy.accessKeyId,
    secretAccessKey: legacy.secretAccessKey,
  };
}

export function getConfigBackupSettingsStored(client?: PrismaClient) {
  return getSetting("backup", CONFIG_BACKUP_DEFAULT, client);
}

export function getTransactionBackupSettingsStored(client?: PrismaClient) {
  return getSetting("transactionBackup", TRANSACTION_BACKUP_DEFAULT, client);
}

export function getDatabaseDumpSettingsStored(client?: PrismaClient) {
  return getSetting("databaseDump", DATABASE_DUMP_DEFAULT, client);
}

export function getLogCleanupSettingsStored(client?: PrismaClient) {
  return getSetting("logCleanup", LOG_CLEANUP_DEFAULT, client);
}

/** Values as stored in the DB, for prefilling the admin settings form. */
export function getSmtpSettingsStored(client?: PrismaClient) {
  return getSetting("smtp", SMTP_DEFAULT, client);
}

/**
 * Effective SMTP config for runtime use: the admin-configured values take
 * priority over environment variables (the opposite precedence from
 * GoPay) — env vars are only a fallback for as long as the admin hasn't
 * set this up in the UI yet.
 */
export async function getEffectiveSmtpSettings(client?: PrismaClient): Promise<SmtpSettings> {
  const stored = await getSmtpSettingsStored(client);
  if (stored.host) return stored;
  return {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "noreply@localhost",
  };
}
