import { getLocale, getTranslations } from "next-intl/server";
import {
  getConfigBackupSettingsStored,
  getDatabaseDumpSettingsStored,
  getEmailVerificationSettingsStored,
  getFioSettingsStored,
  getGoPaySettingsStored,
  getLockSettings,
  getLogCleanupSettingsStored,
  getNotificationSettingsStored,
  getPaymentControlSettings,
  getPaymentReceiptSettingsStored,
  getPendingOrderCleanupSettingsStored,
  getQrPaymentSettings,
  getRegistrationSettings,
  getS3SettingsStored,
  getSmtpSettingsStored,
  getTransactionBackupSettingsStored,
  goPayEnvOverrides,
} from "@/lib/settings";
import {
  adminSaveConfigBackupSettingsAction,
  adminSaveDatabaseDumpSettingsAction,
  adminSaveEmailVerificationSettingsAction,
  adminSaveFioSettingsAction,
  adminSaveGoPaySettingsAction,
  adminSaveLockSettingsAction,
  adminSaveLogCleanupSettingsAction,
  adminSaveNotificationSettingsAction,
  adminSavePaymentControlSettingsAction,
  adminSavePaymentReceiptSettingsAction,
  adminSavePendingOrderCleanupSettingsAction,
  adminSaveQrSettingsAction,
  adminSaveRegistrationSettingsAction,
  adminSaveS3SettingsAction,
  adminSaveSmtpSettingsAction,
  adminSaveTransactionBackupSettingsAction,
} from "@/app/actions";
import { requireRoot } from "@/lib/session";
import { formatAppDateTime } from "@/lib/time";
import { getGateStatus } from "@/lib/lock";
import { SaveButton } from "@/components/SaveButton";
import { GateStatusCard } from "@/components/GateStatusCard";
import { FioPollButton } from "@/components/FioPollButton";

const inputClass = "input !py-1 text-sm";
const primaryButtonClass = "w-fit btn btn-primary !px-3 !py-1.5 text-xs";

export default async function AdminSettingsPage() {
  await requireRoot();
  const [t, tCommon, locale] = await Promise.all([
    getTranslations("admin.settings"),
    getTranslations("common"),
    getLocale(),
  ]);
  const dateLocale = locale === "en" ? "en-GB" : "cs-CZ";
  const lock = await getLockSettings();
  const [
    gateStatus,
    qr,
    paymentControl,
    registration,
    notifications,
    fio,
    gopay,
    gopayOverrides,
    smtp,
    s3,
    configBackup,
    transactionBackup,
    databaseDump,
    logCleanup,
    pendingOrderCleanup,
    emailVerification,
    paymentReceipt,
  ] =
    await Promise.all([
      getGateStatus(lock),
      getQrPaymentSettings(),
      getPaymentControlSettings(),
      getRegistrationSettings(),
      getNotificationSettingsStored(),
      getFioSettingsStored(),
      getGoPaySettingsStored(),
      Promise.resolve(goPayEnvOverrides()),
      getSmtpSettingsStored(),
      getS3SettingsStored(),
      getConfigBackupSettingsStored(),
      getTransactionBackupSettingsStored(),
      getDatabaseDumpSettingsStored(),
      getLogCleanupSettingsStored(),
      getPendingOrderCleanupSettingsStored(),
      getEmailVerificationSettingsStored(),
      getPaymentReceiptSettingsStored(),
    ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>

      <section className="card">
        <h2 className="text-lg font-medium">{t("lockTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("lockHint")}</p>
        <form action={adminSaveLockSettingsAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col text-xs text-[var(--muted)] sm:col-span-2">
            {t("lockAgentUrl")}
            <input name="agentUrl" defaultValue={lock.agentUrl} placeholder="https://gate-ctrl.example.org" className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)] sm:col-span-2">
            {t("lockAgentToken")}
            <input name="agentToken" defaultValue={lock.agentToken} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("lockCooldown")}
            <input name="cooldownSec" type="number" defaultValue={lock.cooldownSec} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("lockTimeout")}
            <input name="timeoutMs" type="number" defaultValue={lock.timeoutMs} className={inputClass} />
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="sm:col-span-2"
          />
        </form>
        <GateStatusCard initialStatus={gateStatus} />
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("qrTitle")}</h2>
        <form action={adminSaveQrSettingsAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="quickPaymentEnabled" defaultChecked={qr.quickPaymentEnabled} />
            {t("qrQuickPaymentEnabled")}
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("qrAccountNumber")}
            <input name="accountNumber" defaultValue={qr.accountNumber} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("qrBankCode")}
            <input name="bankCode" defaultValue={qr.bankCode} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("qrMessageTemplate")}
            <input name="messageTemplate" defaultValue={qr.messageTemplate} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("qrVsPrefix")}
            <input name="vsPrefix" defaultValue={qr.vsPrefix} className={inputClass} />
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="sm:col-span-2"
          />
        </form>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("fioTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("fioHint")}</p>
        <form action={adminSaveFioSettingsAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked={fio.enabled} />
            {t("fioEnabled")}
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("fioToken")}
            <input name="token" type="password" placeholder={fio.token ? "••••••••" : ""} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("fioPollInterval")}
            <input
              name="pollIntervalSeconds"
              type="number"
              min={30}
              defaultValue={fio.pollIntervalSeconds}
              className={inputClass}
            />
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="sm:col-span-2"
          />
        </form>
        <p className="mt-3 text-xs text-[var(--muted)]">
          {fio.lastRunAt
            ? t("fioLastRun", { date: formatAppDateTime(new Date(fio.lastRunAt), dateLocale), count: fio.lastMatchedCount })
            : t("fioNever")}
        </p>
        {fio.lastError && (
          <p className="mt-1 text-xs text-[var(--danger)]">
            {t("fioLastError", { date: formatAppDateTime(new Date(fio.lastErrorAt), dateLocale) })}: {fio.lastError}
          </p>
        )}
        <FioPollButton />
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("paymentControlTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("paymentControlHint")}</p>
        <form action={adminSavePaymentControlSettingsAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("paymentControlPeriodDays")}
            <input
              name="periodDays"
              type="number"
              min={1}
              defaultValue={paymentControl.periodDays}
              className={inputClass}
            />
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="sm:col-span-2"
          />
        </form>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("registrationTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("registrationHint")}</p>
        <form action={adminSaveRegistrationSettingsAction} className="mt-3 grid gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="autoApprove" defaultChecked={registration.autoApprove} />
            {t("registrationAutoApprove")}
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="w-fit"
          />
        </form>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("notificationsTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("notificationsHint")}</p>
        <form action={adminSaveNotificationSettingsAction} className="mt-3 grid gap-2">
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("notificationsRecipients")}
            <textarea
              name="recipients"
              defaultValue={notifications.recipients.join("\n")}
              placeholder={t("notificationsRecipientsHint")}
              rows={4}
              className={`${inputClass} font-mono`}
            />
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="w-fit"
          />
        </form>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("gopayTitle")}</h2>
        <form action={adminSaveGoPaySettingsAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked={gopay.enabled} />
            {t("gopayEnabled")}
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("gopayGoid")} {gopayOverrides.goid && <span className="text-amber-600">({t("envOverrideNote")})</span>}
            <input name="goid" defaultValue={gopay.goid} disabled={gopayOverrides.goid} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("gopayClientId")} {gopayOverrides.clientId && <span className="text-amber-600">({t("envOverrideNote")})</span>}
            <input name="clientId" defaultValue={gopay.clientId} disabled={gopayOverrides.clientId} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("gopayClientSecret")}{" "}
            {gopayOverrides.clientSecret && <span className="text-amber-600">({t("envOverrideNote")})</span>}
            <input
              name="clientSecret"
              type="password"
              placeholder={gopay.clientSecret ? "••••••••" : ""}
              disabled={gopayOverrides.clientSecret}
              className={inputClass}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="sandbox" defaultChecked={gopay.sandbox} disabled={gopayOverrides.sandbox} />
            {t("gopaySandbox")}
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="sm:col-span-2"
          />
        </form>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("smtpTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("smtpHint")}</p>
        <form action={adminSaveSmtpSettingsAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("smtpHost")}
            <input name="host" defaultValue={smtp.host} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("smtpPort")}
            <input name="port" type="number" defaultValue={smtp.port} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("smtpUser")}
            <input name="user" defaultValue={smtp.user} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("smtpPass")}
            <input name="pass" type="password" placeholder={smtp.pass ? "••••••••" : ""} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)] sm:col-span-2">
            {t("smtpFrom")}
            <input name="from" defaultValue={smtp.from} placeholder={t("smtpFromHint")} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)] sm:col-span-2">
            {t("smtpAccountId")}
            <input name="accountId" defaultValue={smtp.accountId} placeholder={t("smtpAccountIdHint")} className={inputClass} />
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="sm:col-span-2"
          />
        </form>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("s3Title")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("s3Hint")}</p>
        <form action={adminSaveS3SettingsAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("s3Bucket")}
            <input name="bucket" defaultValue={s3.bucket} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("s3Region")}
            <input name="region" defaultValue={s3.region} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("s3Endpoint")}
            <input name="endpoint" defaultValue={s3.endpoint} placeholder={t("s3EndpointHint")} className={inputClass} />
          </label>
          <div />
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("s3AccessKeyId")}
            <input name="accessKeyId" defaultValue={s3.accessKeyId} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("s3SecretAccessKey")}
            <input
              name="secretAccessKey"
              type="password"
              placeholder={s3.secretAccessKey ? "••••••••" : ""}
              className={inputClass}
            />
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="sm:col-span-2"
          />
        </form>

        <div className="mt-6 border-t border-[var(--line)] pt-4">
          <h3 className="text-sm font-medium">{t("configBackupTitle")}</h3>
          <form action={adminSaveConfigBackupSettingsAction} className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="enabled" defaultChecked={configBackup.enabled} />
              {t("backupEnabled")}
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("backupPath")}
              <input name="path" defaultValue={configBackup.path} placeholder={t("backupPathHint")} className={inputClass} />
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("backupFrequency")}
              <input
                name="frequencyMinutes"
                type="number"
                min={1}
                defaultValue={configBackup.frequencyMinutes}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("backupKeepCount")}
              <input name="keepCount" type="number" min={1} defaultValue={configBackup.keepCount} className={inputClass} />
            </label>
            <SaveButton
              label={tCommon("save")}
              savedLabel={tCommon("saved")}
              buttonClassName={primaryButtonClass}
              wrapperClassName="sm:col-span-2"
            />
          </form>
          <p className="mt-3 text-xs text-[var(--muted)]">
            {configBackup.lastRunAt
              ? t("backupLastRun", { date: formatAppDateTime(new Date(configBackup.lastRunAt), dateLocale) })
              : t("backupNever")}
          </p>
          {configBackup.lastError && (
            <p className="mt-1 text-xs text-[var(--danger)]">
              {t("backupLastError", { date: formatAppDateTime(new Date(configBackup.lastErrorAt), dateLocale) })}:{" "}
              {configBackup.lastError}
            </p>
          )}
        </div>

        <div className="mt-6 border-t border-[var(--line)] pt-4">
          <h3 className="text-sm font-medium">{t("txBackupTitle")}</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">{t("txBackupHint")}</p>
          <form action={adminSaveTransactionBackupSettingsAction} className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="enabled" defaultChecked={transactionBackup.enabled} />
              {t("backupEnabled")}
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("backupPath")}
              <input
                name="path"
                defaultValue={transactionBackup.path}
                placeholder={t("backupPathHint")}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("backupFrequency")}
              <input
                name="frequencyMinutes"
                type="number"
                min={1}
                defaultValue={transactionBackup.frequencyMinutes}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("backupKeepCount")}
              <input
                name="keepCount"
                type="number"
                min={1}
                defaultValue={transactionBackup.keepCount}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("txBackupRetentionDays")}
              <input
                name="retentionDays"
                type="number"
                min={1}
                defaultValue={transactionBackup.retentionDays}
                className={inputClass}
              />
            </label>
            <SaveButton
              label={tCommon("save")}
              savedLabel={tCommon("saved")}
              buttonClassName={primaryButtonClass}
              wrapperClassName="sm:col-span-2"
            />
          </form>
          <p className="mt-3 text-xs text-[var(--muted)]">
            {transactionBackup.lastRunAt
              ? t("backupLastRun", { date: formatAppDateTime(new Date(transactionBackup.lastRunAt), dateLocale) })
              : t("backupNever")}
          </p>
          {transactionBackup.lastError && (
            <p className="mt-1 text-xs text-[var(--danger)]">
              {t("backupLastError", { date: formatAppDateTime(new Date(transactionBackup.lastErrorAt), dateLocale) })}:{" "}
              {transactionBackup.lastError}
            </p>
          )}
        </div>

        <div className="mt-6 border-t border-[var(--line)] pt-4">
          <h3 className="text-sm font-medium">{t("dbDumpTitle")}</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">{t("dbDumpHint")}</p>
          <form action={adminSaveDatabaseDumpSettingsAction} className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="enabled" defaultChecked={databaseDump.enabled} />
              {t("backupEnabled")}
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("backupPath")}
              <input
                name="path"
                defaultValue={databaseDump.path}
                placeholder={t("backupPathHint")}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("dbDumpFrequencyDays")}
              <input
                name="frequencyDays"
                type="number"
                min={1}
                defaultValue={databaseDump.frequencyDays}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("dbDumpTimeOfDay")}
              <input name="timeOfDay" type="time" defaultValue={databaseDump.timeOfDay} className={inputClass} />
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("backupKeepCount")}
              <input
                name="keepCount"
                type="number"
                min={1}
                defaultValue={databaseDump.keepCount}
                className={inputClass}
              />
            </label>
            <SaveButton
              label={tCommon("save")}
              savedLabel={tCommon("saved")}
              buttonClassName={primaryButtonClass}
              wrapperClassName="sm:col-span-2"
            />
          </form>
          <p className="mt-3 text-xs text-[var(--muted)]">
            {databaseDump.lastRunAt
              ? t("backupLastRun", { date: formatAppDateTime(new Date(databaseDump.lastRunAt), dateLocale) })
              : t("backupNever")}
          </p>
          {databaseDump.lastError && (
            <p className="mt-1 text-xs text-[var(--danger)]">
              {t("backupLastError", { date: formatAppDateTime(new Date(databaseDump.lastErrorAt), dateLocale) })}:{" "}
              {databaseDump.lastError}
            </p>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("logCleanupTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("logCleanupHint")}</p>
        <form action={adminSaveLogCleanupSettingsAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked={logCleanup.enabled} />
            {t("logCleanupEnabled")}
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("logCleanupMaxAgeDays")}
            <input name="maxAgeDays" type="number" min={1} defaultValue={logCleanup.maxAgeDays} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("logCleanupFrequencyDays")}
            <input
              name="frequencyDays"
              type="number"
              min={1}
              defaultValue={logCleanup.frequencyDays}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("logCleanupTimeOfDay")}
            <input name="timeOfDay" type="time" defaultValue={logCleanup.timeOfDay} className={inputClass} />
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="sm:col-span-2"
          />
        </form>
        <p className="mt-3 text-xs text-[var(--muted)]">
          {logCleanup.lastRunAt
            ? t("logCleanupLastRun", {
                date: formatAppDateTime(new Date(logCleanup.lastRunAt), dateLocale),
                count: logCleanup.lastDeletedCount,
              })
            : t("logCleanupNever")}
        </p>
        {logCleanup.lastError && (
          <p className="mt-1 text-xs text-[var(--danger)]">
            {t("logCleanupLastError", { date: formatAppDateTime(new Date(logCleanup.lastErrorAt), dateLocale) })}:{" "}
            {logCleanup.lastError}
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("pendingOrderCleanupTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("pendingOrderCleanupHint")}</p>
        <form action={adminSavePendingOrderCleanupSettingsAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked={pendingOrderCleanup.enabled} />
            {t("pendingOrderCleanupEnabled")}
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("pendingOrderCleanupMaxAgeDays")}
            <input
              name="maxAgeDays"
              type="number"
              min={1}
              defaultValue={pendingOrderCleanup.maxAgeDays}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("pendingOrderCleanupFrequencyDays")}
            <input
              name="frequencyDays"
              type="number"
              min={1}
              defaultValue={pendingOrderCleanup.frequencyDays}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("pendingOrderCleanupTimeOfDay")}
            <input name="timeOfDay" type="time" defaultValue={pendingOrderCleanup.timeOfDay} className={inputClass} />
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="sm:col-span-2"
          />
        </form>
        <p className="mt-3 text-xs text-[var(--muted)]">
          {pendingOrderCleanup.lastRunAt
            ? t("pendingOrderCleanupLastRun", {
                date: formatAppDateTime(new Date(pendingOrderCleanup.lastRunAt), dateLocale),
                count: pendingOrderCleanup.lastDeletedCount,
              })
            : t("pendingOrderCleanupNever")}
        </p>
        {pendingOrderCleanup.lastError && (
          <p className="mt-1 text-xs text-[var(--danger)]">
            {t("pendingOrderCleanupLastError", {
              date: formatAppDateTime(new Date(pendingOrderCleanup.lastErrorAt), dateLocale),
            })}
            : {pendingOrderCleanup.lastError}
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("emailVerificationTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("emailVerificationHint")}</p>
        <form action={adminSaveEmailVerificationSettingsAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked={emailVerification.enabled} />
            {t("emailVerificationEnabled")}
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("emailVerificationGraceDays")}
            <input
              name="graceDays"
              type="number"
              min={1}
              defaultValue={emailVerification.graceDays}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("emailVerificationFrequencyDays")}
            <input
              name="frequencyDays"
              type="number"
              min={1}
              defaultValue={emailVerification.frequencyDays}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("emailVerificationTimeOfDay")}
            <input name="timeOfDay" type="time" defaultValue={emailVerification.timeOfDay} className={inputClass} />
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="sm:col-span-2"
          />
        </form>
        <p className="mt-3 text-xs text-[var(--muted)]">
          {emailVerification.lastRunAt
            ? t("emailVerificationLastRun", {
                date: formatAppDateTime(new Date(emailVerification.lastRunAt), dateLocale),
                count: emailVerification.lastSuspendedCount,
              })
            : t("emailVerificationNever")}
        </p>
        {emailVerification.lastError && (
          <p className="mt-1 text-xs text-[var(--danger)]">
            {t("emailVerificationLastError", {
              date: formatAppDateTime(new Date(emailVerification.lastErrorAt), dateLocale),
            })}
            : {emailVerification.lastError}
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("paymentReceiptTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("paymentReceiptHint")}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("paymentReceiptPlaceholders")}</p>
        <form action={adminSavePaymentReceiptSettingsAction} className="mt-3 flex flex-col gap-2">
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("paymentReceiptSubject")}
            <input name="subject" defaultValue={paymentReceipt.subject} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("paymentReceiptBody")}
            <textarea name="bodyTemplate" defaultValue={paymentReceipt.bodyTemplate} rows={8} className={`${inputClass} font-mono`} />
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="w-fit"
          />
        </form>
      </section>
    </div>
  );
}
