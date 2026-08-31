import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "./db";
import { getEnv } from "./env";

export type LockSettings = {
  /**
   * Base URL of the gate agent's direct HTTP API — a small endpoint added
   * to the Node.js controller agent that already runs next to the
   * physical lock (Modbus/Quido), reachable through a Cloudflare Tunnel.
   * Empty = simulated open (no hardware). All wiring detail (relay
   * circuit, door contact inversion, pulse duration) lives in the
   * agent's own config, not here — this app just calls POST /open and
   * GET /status.
   */
  agentUrl: string;
  /** Bearer token the agent's HTTP API requires (Authorization: Bearer <token>). */
  agentToken: string;
  cooldownSec: number;
  /** HTTP timeout for calling the agent — /open blocks until the physical pulse finishes, so this must comfortably exceed the agent's own pulse duration. */
  timeoutMs: number;
  /**
   * When true, a member's first entry of the calendar day (self-service gate
   * open or staff verification — both go through `openGateForUser`) is the
   * only one that deducts a credit; every further entry that same day
   * (Europe/Prague, until midnight) is free. Doesn't affect admins or active
   * period-pass holders, who already open for free regardless.
   */
  dailyUnlimitedEntries: boolean;
};

export type QrPaymentSettings = {
  accountNumber: string;
  bankCode: string;
  messageTemplate: string;
  vsPrefix: string;
  /** Shows/hides the standalone "Okamžitá platba za vstup" QR widget (login page, dashboard) — independent of the QR bank-transfer option in the Buy flow, which stays available whenever accountNumber/bankCode are set. */
  quickPaymentEnabled: boolean;
};

/** How far back the "Kontrola plateb" (payment control) page looks for period payments and prepaid-pass entry usage. */
export type PaymentControlSettings = {
  periodDays: number;
};

/** Numeric door-lock combination for the WC, shown to members on their account page. Empty = not configured, card is hidden. */
export type WcCodeSettings = {
  code: string;
};

export type RegistrationSettings = {
  /** When true, new registrations get UserStatus.APPROVED immediately instead of PENDING — skips the admin approval queue. */
  autoApprove: boolean;
};

/**
 * Who receives admin-facing notification emails (new registration pending
 * approval, QR payment awaiting confirmation) — replaces the old behavior
 * of emailing every `User` with `role: ADMIN`. Empty = no notifications
 * sent until an admin configures this.
 */
export type NotificationSettings = {
  recipients: string[];
};

export type FioSettings = {
  enabled: boolean;
  /** Read-only "Sledování účtu" API token, generated in Fio internetbanking under Nastavení → API. */
  token: string;
  /** How often to poll for new transactions, in seconds. Fio's own API recommends a 30s floor per token. */
  pollIntervalSeconds: number;
  /** ISO instant of the last poll attempt (successful or not), or "" if never run. */
  lastRunAt: string;
  /** How many pending payment orders the last run auto-confirmed. */
  lastMatchedCount: number;
  lastError: string;
  lastErrorAt: string;
};

export type GoPaySettings = {
  enabled: boolean;
  goid: string;
  clientId: string;
  clientSecret: string;
  sandbox: boolean;
};

export type GoogleOAuthSettings = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
};

export type SmtpSettings = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  /**
   * Cloudflare account ID — only used on the D1/Workers branch, and only
   * when `host` is Cloudflare's own Email Sending endpoint
   * (`*.mx.cloudflare.net`). That host can't be reached via a raw TCP
   * socket from inside a Worker (Workers can't open sockets to
   * Cloudflare's own network), so that branch sends through Cloudflare's
   * HTTP Email Sending API instead, which needs the account ID alongside
   * the API token already stored in `pass`. Ignored by every other
   * branch/host.
   */
  accountId: string;
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

export type EmailVerificationSettings = {
  enabled: boolean;
  /** Suspend the account if still unverified after this many days. */
  graceDays: number;
  timeOfDay: string;
  frequencyDays: number;
  lastRunAt: string;
  /** How many accounts the last successful run suspended. */
  lastSuspendedCount: number;
  lastError: string;
  lastErrorAt: string;
};

/**
 * Content of the payment-confirmation email's PDF attachment (the
 * "účtenka") — admin-editable so the wording can change without a code
 * deploy. `subject` is the email's subject line; `pdfText` is the entire
 * body of the attached PDF. Both may reference `{PAYMENT_TYPE}`,
 * `{AMOUNT}`, and `{CREDITS}`, substituted at send time (see
 * `applyReceiptTemplate` in `registration-mail.ts`). The email body itself
 * is a fixed, non-configurable sentence — only the subject and the PDF
 * content are admin-editable.
 */
export type PaymentReceiptSettings = {
  subject: string;
  pdfText: string;
};

export type PendingOrderCleanupSettings = {
  enabled: boolean;
  /** Delete PaymentOrder rows still PENDING after this many hours. */
  maxAgeHours: number;
  /**
   * How often the cleanup runs, in hours. Unlike the daily jobs (log cleanup,
   * email verification) this has no fixed time-of-day anchor — a sub-daily
   * interval can't honour one — so it's a plain "N hours since lastRunAt"
   * check, the same shape the Fio poll uses.
   */
  frequencyHours: number;
  lastRunAt: string;
  /** How many rows the last successful run deleted. */
  lastDeletedCount: number;
  lastError: string;
  lastErrorAt: string;
};

/** Server-to-server handoff to the separate Logbook app — see `src/lib/logbook.ts`. */
export type LogbookSettings = {
  enabled: boolean;
  /** Logbook's base URL, e.g. "https://logbook-dev.example.workers.dev" — no trailing slash. */
  url: string;
  /** Shared secret both sides use to authenticate the exchange/verify calls. */
  sharedSecret: string;
};

/**
 * Reports confirmed payments to the separate "eet" Worker (EET 2.0 —
 * Elektronická evidence tržeb), which handles the actual signed submission
 * and its own retry queue — see `src/lib/eet.ts`. Off by default: EET 2.0
 * isn't in force as law yet, and even once it is, membership dues/most of
 * this club's revenue may fall outside its scope — get an accountant's
 * read before turning this on.
 */
export type EetSettings = {
  enabled: boolean;
  /** Base URL of the eet Worker, e.g. "https://eet.example.workers.dev" — no trailing slash, no "/report" suffix. */
  endpoint: string;
  /** Bearer token the eet Worker's API requires (Authorization: Bearer <token>). */
  token: string;
};

const LOCK_DEFAULT: LockSettings = {
  agentUrl: "",
  agentToken: "",
  cooldownSec: 60,
  timeoutMs: 15000,
  dailyUnlimitedEntries: false,
};

const QR_PAYMENT_DEFAULT: QrPaymentSettings = {
  accountNumber: "",
  bankCode: "",
  messageTemplate: "Stena Letnak {vs}",
  vsPrefix: "1",
  quickPaymentEnabled: true,
};

const PAYMENT_CONTROL_DEFAULT: PaymentControlSettings = {
  periodDays: 30,
};

const WC_CODE_DEFAULT: WcCodeSettings = {
  code: "",
};

const REGISTRATION_DEFAULT: RegistrationSettings = {
  autoApprove: false,
};

const NOTIFICATION_DEFAULT: NotificationSettings = {
  recipients: [],
};

const FIO_DEFAULT: FioSettings = {
  enabled: false,
  token: "",
  pollIntervalSeconds: 60,
  lastRunAt: "",
  lastMatchedCount: 0,
  lastError: "",
  lastErrorAt: "",
};

const GOPAY_DEFAULT: GoPaySettings = {
  enabled: true,
  goid: "",
  clientId: "",
  clientSecret: "",
  sandbox: true,
};

const GOOGLE_OAUTH_DEFAULT: GoogleOAuthSettings = {
  enabled: false,
  clientId: "",
  clientSecret: "",
};

const SMTP_DEFAULT: SmtpSettings = {
  host: "",
  port: 587,
  user: "",
  pass: "",
  from: "",
  accountId: "",
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

const EMAIL_VERIFICATION_DEFAULT: EmailVerificationSettings = {
  enabled: true,
  graceDays: 7,
  timeOfDay: "04:00",
  frequencyDays: 1,
  lastRunAt: "",
  lastSuspendedCount: 0,
  lastError: "",
  lastErrorAt: "",
};

const PAYMENT_RECEIPT_DEFAULT: PaymentReceiptSettings = {
  subject: "Potvrzení platby — Stěna Letňák Tišnov ({AMOUNT})",
  pdfText: [
    "Lezecká stěna Tišnov, z.s.",
    "IČ: 21121923",
    "Riegrova 340, 666 01 Tišnov",
    "Provozovna: Hornická 1725, Tišnov",
    "Neplátce DPH",
    "",
    "Děkujeme za platbu.",
    "",
    "Datum: {DATE}",
    "Typ platby: {PAYMENT_TYPE}",
    "Variabilní symbol: {VS}",
    "Částka: {AMOUNT}",
    "Počet vstupů: {CREDITS}",
    "",
    "Bankovní účet: 2503524112/2010",
    "info@stenatisnov.cz",
  ].join("\n"),
};

const PENDING_ORDER_CLEANUP_DEFAULT: PendingOrderCleanupSettings = {
  enabled: false,
  maxAgeHours: 168,
  frequencyHours: 24,
  lastRunAt: "",
  lastDeletedCount: 0,
  lastError: "",
  lastErrorAt: "",
};

const LOGBOOK_DEFAULT: LogbookSettings = {
  enabled: false,
  url: "",
  sharedSecret: "",
};

const EET_DEFAULT: EetSettings = {
  enabled: false,
  endpoint: "",
  token: "",
};

/**
 * Reads a JSON-valued setting row, falling back to defaults for missing
 * keys. Accepts an explicit `client` for callers that already have their
 * own Prisma client and can't rely on this module's own resolution — e.g.
 * the D1 branch's scheduled backup job, which runs outside the fetch
 * request lifecycle `getPrisma()` depends on there.
 */
export async function getSetting<T extends object>(key: string, fallback: T, client?: PrismaClient): Promise<T> {
  const c = client ?? (await getPrisma());
  const row = await c.appSetting.findUnique({ where: { key } });
  if (!row) return fallback;
  return { ...fallback, ...(row.value as object) } as T;
}

export async function setSetting(key: string, value: unknown, client?: PrismaClient) {
  const c = client ?? (await getPrisma());
  await c.appSetting.upsert({
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

export function getPaymentControlSettings(client?: PrismaClient) {
  return getSetting("paymentControl", PAYMENT_CONTROL_DEFAULT, client);
}

export function getWcCodeSettingsStored(client?: PrismaClient) {
  return getSetting("wcCode", WC_CODE_DEFAULT, client);
}

export function getRegistrationSettings(client?: PrismaClient) {
  return getSetting("registration", REGISTRATION_DEFAULT, client);
}

export function getNotificationSettingsStored(client?: PrismaClient) {
  return getSetting("notifications", NOTIFICATION_DEFAULT, client);
}

export function getFioSettingsStored(client?: PrismaClient) {
  return getSetting("fio", FIO_DEFAULT, client);
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
    enabled: stored.enabled,
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

/** Values as stored in the DB, for prefilling the admin settings form. */
export function getGoogleOAuthSettingsStored(client?: PrismaClient) {
  return getSetting("googleOAuth", GOOGLE_OAUTH_DEFAULT, client);
}

/**
 * Effective Google OAuth config for runtime use: env vars take precedence
 * over the admin-configured values (same precedence as GoPay). Uses
 * `getEnv()`, not raw `process.env` — the D1/Workers branch's secrets only
 * ever land on `context.cloudflare.env`, reachable through the same
 * ambient `getLoadContext()` lookup every other per-branch env read uses.
 */
export async function getGoogleOAuthSettings(): Promise<GoogleOAuthSettings> {
  const stored = await getGoogleOAuthSettingsStored();
  const env = getEnv();
  return {
    enabled: stored.enabled,
    clientId: env.GOOGLE_CLIENT_ID || stored.clientId,
    clientSecret: env.GOOGLE_CLIENT_SECRET || stored.clientSecret,
  };
}

/** Which Google OAuth fields are pinned by env vars — used to gray out those form fields. */
export function googleOAuthEnvOverrides() {
  const env = getEnv();
  return {
    clientId: Boolean(env.GOOGLE_CLIENT_ID),
    clientSecret: Boolean(env.GOOGLE_CLIENT_SECRET),
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

export function getPendingOrderCleanupSettingsStored(client?: PrismaClient) {
  return getSetting("pendingOrderCleanup", PENDING_ORDER_CLEANUP_DEFAULT, client);
}

export function getLogbookSettingsStored(client?: PrismaClient) {
  return getSetting("logbook", LOGBOOK_DEFAULT, client);
}

export function getEetSettingsStored(client?: PrismaClient) {
  return getSetting("eet", EET_DEFAULT, client);
}

export function getEmailVerificationSettingsStored(client?: PrismaClient) {
  return getSetting("emailVerification", EMAIL_VERIFICATION_DEFAULT, client);
}

export function getPaymentReceiptSettingsStored(client?: PrismaClient) {
  return getSetting("paymentReceipt", PAYMENT_RECEIPT_DEFAULT, client);
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
    accountId: process.env.SMTP_ACCOUNT_ID || "",
  };
}
