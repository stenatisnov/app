import { getPrisma } from "@/lib/db.server";
import { audit } from "@/lib/audit";
import { getGateStatus } from "@/lib/lock";
import {
  getConfigBackupSettingsStored,
  getDatabaseDumpSettingsStored,
  getEmailVerificationSettingsStored,
  getFioSettingsStored,
  getGoogleOAuthSettingsStored,
  getGoPaySettingsStored,
  getLogbookSettingsStored,
  getLogCleanupSettingsStored,
  getPaymentReceiptSettingsStored,
  getPendingOrderCleanupSettingsStored,
  getS3SettingsStored,
  getSmtpSettingsStored,
  getTransactionBackupSettingsStored,
  setSetting,
} from "@/lib/settings";
import { runConfigBackupIfDue, runDatabaseDumpIfDue, runTransactionBackupIfDue } from "@/lib/backup";
import { runLogCleanupIfDue } from "@/lib/log-cleanup";
import { runPendingOrderCleanupIfDue } from "@/lib/pending-order-cleanup";
import { runEmailVerificationSuspensionIfDue } from "@/lib/email-verification";
import { runFioPollIfDue } from "@/lib/fio";

// ---------------------------------------------------------------------------
// Admin — settings
// ---------------------------------------------------------------------------

export async function adminSaveLockSettingsAction(formData: FormData) {
  await setSetting("lock", {
    agentUrl: String(formData.get("agentUrl") || "").trim(),
    agentToken: String(formData.get("agentToken") || "").trim(),
    cooldownSec: Number(formData.get("cooldownSec") || 60),
    timeoutMs: Number(formData.get("timeoutMs") || 15000),
    dailyUnlimitedEntries: formData.get("dailyUnlimitedEntries") === "on",
  });
  await audit({ action: "admin.settings.lock", success: true });
}

/** Live EVOK status check for the settings page — fetched on demand, no background polling. */
export async function adminCheckGateStatusAction() {
  return getGateStatus();
}

export async function adminSaveQrSettingsAction(formData: FormData) {
  await setSetting("qrPayment", {
    accountNumber: String(formData.get("accountNumber") || ""),
    bankCode: String(formData.get("bankCode") || ""),
    messageTemplate: String(formData.get("messageTemplate") || "Stena Letnak {vs}"),
    // Digits only, capped so at least one timestamp digit is always left —
    // see the comment at the VS generation site above for why.
    vsPrefix: String(formData.get("vsPrefix") || "1").replace(/\D/g, "").slice(0, 9) || "1",
    quickPaymentEnabled: formData.get("quickPaymentEnabled") === "on",
  });
}

export async function adminSaveRegistrationSettingsAction(formData: FormData) {
  const autoApprove = formData.get("autoApprove") === "on";
  await setSetting("registration", { autoApprove });
}

export async function adminSaveNotificationSettingsAction(formData: FormData) {
  const raw = String(formData.get("recipients") || "");
  const recipients = [...new Set(raw.split(/[\n,]/).map((e) => e.trim()).filter(Boolean))];
  await setSetting("notifications", { recipients });
  await audit({ action: "admin.settings.notifications", success: true, meta: { count: recipients.length } });
}

export async function adminSavePaymentControlSettingsAction(formData: FormData) {
  const periodDays = Math.max(1, Number(formData.get("periodDays") || 30));
  await setSetting("paymentControl", { periodDays });
}

export async function adminSaveWcCodeSettingsAction(formData: FormData) {
  const code = String(formData.get("code") || "").trim();
  await setSetting("wcCode", { code });
}

export async function adminSaveFioSettingsAction(formData: FormData) {
  const current = await getFioSettingsStored();
  const incomingToken = String(formData.get("token") || "").trim();
  // Fio's own API only recommends a 30s floor per token.
  const pollIntervalSeconds = Math.max(30, Number(formData.get("pollIntervalSeconds") || current.pollIntervalSeconds || 60));

  await setSetting("fio", {
    ...current,
    enabled: formData.get("enabled") === "on",
    // An empty token field means "keep the previously stored token".
    token: incomingToken || current.token,
    pollIntervalSeconds,
  });

  await audit({
    action: "admin.settings.fio",
    success: true,
    meta: { enabled: formData.get("enabled") === "on", tokenUpdated: Boolean(incomingToken), pollIntervalSeconds },
  });
}

export async function adminSaveGoPaySettingsAction(formData: FormData) {
  const current = await getGoPaySettingsStored();
  const incomingSecret = String(formData.get("clientSecret") || "");

  await setSetting("gopay", {
    enabled: formData.get("enabled") === "on",
    goid: String(formData.get("goid") || "").trim(),
    clientId: String(formData.get("clientId") || "").trim(),
    // An empty secret field means "keep the previously stored secret".
    clientSecret: incomingSecret || current.clientSecret,
    sandbox: formData.get("sandbox") === "on",
  });

  await audit({
    action: "admin.settings.gopay",
    success: true,
    meta: {
      enabled: formData.get("enabled") === "on",
      goidSet: Boolean(String(formData.get("goid") || "").trim()),
      clientIdSet: Boolean(String(formData.get("clientId") || "").trim()),
      secretUpdated: Boolean(incomingSecret),
      sandbox: formData.get("sandbox") === "on",
    },
  });
}

export async function adminSaveLogbookSettingsAction(formData: FormData) {
  const current = await getLogbookSettingsStored();
  const incomingSecret = String(formData.get("sharedSecret") || "");
  const url = String(formData.get("url") || "").trim().replace(/\/+$/, "");

  await setSetting("logbook", {
    enabled: formData.get("enabled") === "on",
    url,
    // An empty secret field means "keep the previously stored secret".
    sharedSecret: incomingSecret || current.sharedSecret,
  });

  await audit({
    action: "admin.settings.logbook",
    success: true,
    meta: {
      enabled: formData.get("enabled") === "on",
      url,
      secretUpdated: Boolean(incomingSecret),
    },
  });
}

export async function adminSaveGoogleOAuthSettingsAction(formData: FormData) {
  const current = await getGoogleOAuthSettingsStored();
  const incomingSecret = String(formData.get("clientSecret") || "");
  const clientId = String(formData.get("clientId") || "").trim();

  await setSetting("googleOAuth", {
    enabled: formData.get("enabled") === "on",
    clientId,
    // An empty secret field means "keep the previously stored secret".
    clientSecret: incomingSecret || current.clientSecret,
  });

  await audit({
    action: "admin.settings.google_oauth",
    success: true,
    meta: { enabled: formData.get("enabled") === "on", clientIdSet: Boolean(clientId), secretUpdated: Boolean(incomingSecret) },
  });
}

export async function adminSaveSmtpSettingsAction(formData: FormData) {
  const current = await getSmtpSettingsStored();
  const incomingPass = String(formData.get("pass") || "");
  const host = String(formData.get("host") || "").trim();

  await setSetting("smtp", {
    host,
    port: Number(formData.get("port") || current.port || 587),
    user: String(formData.get("user") || "").trim(),
    // An empty password field means "keep the previously stored password".
    pass: incomingPass || current.pass,
    from: String(formData.get("from") || "").trim(),
    accountId: String(formData.get("accountId") || "").trim(),
  });

  await audit({
    action: "admin.settings.smtp",
    success: true,
    meta: { host, passUpdated: Boolean(incomingPass) },
  });
}

/** Trims, drops any leading slash, and ensures exactly one trailing slash (unless empty = bucket root). */
function normalizeBackupPath(raw: string): string {
  const trimmed = raw.trim().replace(/^\/+/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

/** Strips an accidental "http(s)://" prefix and trailing slashes — easy to paste in from a provider's dashboard. */
function normalizeEndpoint(raw: string): string {
  return raw.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

export async function adminSaveS3SettingsAction(formData: FormData) {
  const current = await getS3SettingsStored();
  const incomingSecret = String(formData.get("secretAccessKey") || "");
  const bucket = String(formData.get("bucket") || "").trim();

  await setSetting("s3", {
    bucket,
    region: String(formData.get("region") || "").trim() || "us-east-1",
    endpoint: normalizeEndpoint(String(formData.get("endpoint") || "")),
    accessKeyId: String(formData.get("accessKeyId") || "").trim(),
    // An empty secret field means "keep the previously stored secret".
    secretAccessKey: incomingSecret || current.secretAccessKey,
  });

  await audit({
    action: "admin.settings.s3",
    success: true,
    meta: { bucket, secretUpdated: Boolean(incomingSecret) },
  });
}

export async function adminSaveConfigBackupSettingsAction(formData: FormData) {
  const current = await getConfigBackupSettingsStored();
  const frequencyMinutes = Math.max(1, Number(formData.get("frequencyMinutes") || current.frequencyMinutes || 60));
  const keepCount = Math.max(1, Number(formData.get("keepCount") || current.keepCount || 10));
  const path = normalizeBackupPath(String(formData.get("path") || ""));

  await setSetting("backup", { ...current, enabled: formData.get("enabled") === "on", path, frequencyMinutes, keepCount });

  await audit({
    action: "admin.settings.backup",
    success: true,
    meta: { enabled: formData.get("enabled") === "on", frequencyMinutes, keepCount },
  });
}

export async function adminSaveTransactionBackupSettingsAction(formData: FormData) {
  const current = await getTransactionBackupSettingsStored();
  const frequencyMinutes = Math.max(1, Number(formData.get("frequencyMinutes") || current.frequencyMinutes || 60));
  const keepCount = Math.max(1, Number(formData.get("keepCount") || current.keepCount || 10));
  const retentionDays = Math.max(1, Number(formData.get("retentionDays") || current.retentionDays || 90));
  const path = normalizeBackupPath(String(formData.get("path") || ""));

  await setSetting("transactionBackup", {
    ...current,
    enabled: formData.get("enabled") === "on",
    path,
    frequencyMinutes,
    keepCount,
    retentionDays,
  });

  await audit({
    action: "admin.settings.transaction_backup",
    success: true,
    meta: { enabled: formData.get("enabled") === "on", frequencyMinutes, keepCount, retentionDays },
  });
}

export async function adminSaveDatabaseDumpSettingsAction(formData: FormData) {
  const current = await getDatabaseDumpSettingsStored();
  const frequencyDays = Math.max(1, Number(formData.get("frequencyDays") || current.frequencyDays || 1));
  const keepCount = Math.max(1, Number(formData.get("keepCount") || current.keepCount || 7));
  const path = normalizeBackupPath(String(formData.get("path") || ""));
  const rawTimeOfDay = String(formData.get("timeOfDay") || "");
  const timeOfDay = /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTimeOfDay) ? rawTimeOfDay : current.timeOfDay;

  await setSetting("databaseDump", {
    ...current,
    enabled: formData.get("enabled") === "on",
    path,
    frequencyDays,
    timeOfDay,
    keepCount,
  });

  await audit({
    action: "admin.settings.database_dump",
    success: true,
    meta: { enabled: formData.get("enabled") === "on", frequencyDays, timeOfDay, keepCount },
  });
}

export async function adminSaveLogCleanupSettingsAction(formData: FormData) {
  const current = await getLogCleanupSettingsStored();
  const maxAgeDays = Math.max(1, Number(formData.get("maxAgeDays") || current.maxAgeDays || 90));
  const frequencyDays = Math.max(1, Number(formData.get("frequencyDays") || current.frequencyDays || 1));
  const rawTimeOfDay = String(formData.get("timeOfDay") || "");
  const timeOfDay = /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTimeOfDay) ? rawTimeOfDay : current.timeOfDay;

  await setSetting("logCleanup", { ...current, enabled: formData.get("enabled") === "on", maxAgeDays, timeOfDay, frequencyDays });

  await audit({
    action: "admin.settings.log_cleanup",
    success: true,
    meta: { enabled: formData.get("enabled") === "on", maxAgeDays, timeOfDay, frequencyDays },
  });
}

export async function adminSavePendingOrderCleanupSettingsAction(formData: FormData) {
  const current = await getPendingOrderCleanupSettingsStored();
  const maxAgeHours = Math.max(1, Number(formData.get("maxAgeHours") || current.maxAgeHours || 168));
  const frequencyHours = Math.max(1, Number(formData.get("frequencyHours") || current.frequencyHours || 24));

  await setSetting("pendingOrderCleanup", {
    ...current,
    enabled: formData.get("enabled") === "on",
    maxAgeHours,
    frequencyHours,
  });

  await audit({
    action: "admin.settings.pending_order_cleanup",
    success: true,
    meta: { enabled: formData.get("enabled") === "on", maxAgeHours, frequencyHours },
  });
}

export async function adminSaveEmailVerificationSettingsAction(formData: FormData) {
  const current = await getEmailVerificationSettingsStored();
  const graceDays = Math.max(1, Number(formData.get("graceDays") || current.graceDays || 7));
  const frequencyDays = Math.max(1, Number(formData.get("frequencyDays") || current.frequencyDays || 1));
  const rawTimeOfDay = String(formData.get("timeOfDay") || "");
  const timeOfDay = /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTimeOfDay) ? rawTimeOfDay : current.timeOfDay;

  await setSetting("emailVerification", {
    ...current,
    enabled: formData.get("enabled") === "on",
    graceDays,
    timeOfDay,
    frequencyDays,
  });

  await audit({
    action: "admin.settings.email_verification",
    success: true,
    meta: { enabled: formData.get("enabled") === "on", graceDays, timeOfDay, frequencyDays },
  });
}

export async function adminSavePaymentReceiptSettingsAction(formData: FormData) {
  const current = await getPaymentReceiptSettingsStored();
  const subject = String(formData.get("subject") || "").trim() || current.subject;
  const pdfText = String(formData.get("pdfText") || "").trim() || current.pdfText;

  await setSetting("paymentReceipt", { subject, pdfText });

  await audit({ action: "admin.settings.payment_receipt", success: true });
}

export type ManualBackupResult = { ok: true } | { ok: false; message: string };

export async function adminRunConfigBackupAction(): Promise<ManualBackupResult> {
  const prisma = await getPrisma();
  try {
    await runConfigBackupIfDue(prisma, { force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function adminRunTransactionBackupAction(): Promise<ManualBackupResult> {
  const prisma = await getPrisma();
  try {
    await runTransactionBackupIfDue(prisma, { force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function adminRunDatabaseDumpAction(): Promise<ManualBackupResult> {
  const prisma = await getPrisma();
  try {
    await runDatabaseDumpIfDue(prisma, { force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export type ManualFioPollResult = { ok: true; matchedCount: number } | { ok: false; message: string };

export async function adminRunFioPollAction(): Promise<ManualFioPollResult> {
  const prisma = await getPrisma();
  try {
    await runFioPollIfDue(prisma, { force: true });
    const settings = await getFioSettingsStored();
    return { ok: true, matchedCount: settings.lastMatchedCount };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export type ManualLogCleanupResult = { ok: true; deletedCount: number } | { ok: false; message: string };

export async function adminRunLogCleanupAction(): Promise<ManualLogCleanupResult> {
  const prisma = await getPrisma();
  try {
    await runLogCleanupIfDue(prisma, { force: true });
    const settings = await getLogCleanupSettingsStored();
    return { ok: true, deletedCount: settings.lastDeletedCount };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export type ManualPendingOrderCleanupResult = { ok: true; deletedCount: number } | { ok: false; message: string };

export async function adminRunPendingOrderCleanupAction(): Promise<ManualPendingOrderCleanupResult> {
  const prisma = await getPrisma();
  try {
    await runPendingOrderCleanupIfDue(prisma, { force: true });
    const settings = await getPendingOrderCleanupSettingsStored();
    return { ok: true, deletedCount: settings.lastDeletedCount };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export type ManualEmailVerificationSuspensionResult = { ok: true; suspendedCount: number } | { ok: false; message: string };

export async function adminRunEmailVerificationSuspensionAction(): Promise<ManualEmailVerificationSuspensionResult> {
  const prisma = await getPrisma();
  try {
    await runEmailVerificationSuspensionIfDue(prisma, { force: true });
    const settings = await getEmailVerificationSettingsStored();
    return { ok: true, suspendedCount: settings.lastSuspendedCount };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
