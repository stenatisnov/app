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

export type BackupSettings = {
  enabled: boolean;
  bucket: string;
  region: string;
  /** Custom S3-compatible endpoint host (e.g. an R2/MinIO/Spaces host); empty = AWS S3. */
  endpoint: string;
  /** Object-key prefix ("directory") backups are stored under within the bucket. Always ends in "/" once normalized, or is "". */
  path: string;
  accessKeyId: string;
  secretAccessKey: string;
  frequencyMinutes: number;
  /** ISO instant of the last successful backup, or "" if none yet. */
  lastRunAt: string;
  /** Message from the most recent failed attempt, or "" if the last attempt succeeded. */
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

const BACKUP_DEFAULT: BackupSettings = {
  enabled: false,
  bucket: "",
  region: "us-east-1",
  endpoint: "",
  path: "stena-letnak-backups/",
  accessKeyId: "",
  secretAccessKey: "",
  frequencyMinutes: 60,
  lastRunAt: "",
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

export function getBackupSettingsStored(client?: PrismaClient) {
  return getSetting("backup", BACKUP_DEFAULT, client);
}
