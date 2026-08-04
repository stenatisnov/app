import { getLocale, getTranslations } from "next-intl/server";
import {
  getConfigBackupSettingsStored,
  getDatabaseDumpSettingsStored,
  getGoPaySettingsStored,
  getLockSettings,
  getQrPaymentSettings,
  getS3SettingsStored,
  getSmtpSettingsStored,
  getTransactionBackupSettingsStored,
  goPayEnvOverrides,
} from "@/lib/settings";
import {
  adminSaveConfigBackupSettingsAction,
  adminSaveDatabaseDumpSettingsAction,
  adminSaveGoPaySettingsAction,
  adminSaveLockSettingsAction,
  adminSaveQrSettingsAction,
  adminSaveS3SettingsAction,
  adminSaveSmtpSettingsAction,
  adminSaveTransactionBackupSettingsAction,
} from "@/app/actions";
import { requireRoot } from "@/lib/session";
import { formatAppDateTime } from "@/lib/time";

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
  const [lock, qr, gopay, gopayOverrides, smtp, s3, configBackup, transactionBackup, databaseDump] = await Promise.all([
    getLockSettings(),
    getQrPaymentSettings(),
    getGoPaySettingsStored(),
    Promise.resolve(goPayEnvOverrides()),
    getSmtpSettingsStored(),
    getS3SettingsStored(),
    getConfigBackupSettingsStored(),
    getTransactionBackupSettingsStored(),
    getDatabaseDumpSettingsStored(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>

      <section className="card">
        <h2 className="text-lg font-medium">{t("lockTitle")}</h2>
        <form action={adminSaveLockSettingsAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("lockUrl")}
            <input name="url" defaultValue={lock.url} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("lockToken")}
            <input name="token" defaultValue={lock.token} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("lockMethod")}
            <input name="method" defaultValue={lock.method} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("lockOpenDuration")}
            <input name="openDurationSec" type="number" defaultValue={lock.openDurationSec} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("lockCooldown")}
            <input name="cooldownSec" type="number" defaultValue={lock.cooldownSec} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("lockTimeout")}
            <input name="timeoutMs" type="number" defaultValue={lock.timeoutMs} className={inputClass} />
          </label>
          <button className={`${primaryButtonClass} sm:col-span-2`}>{tCommon("save")}</button>
        </form>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("qrTitle")}</h2>
        <form action={adminSaveQrSettingsAction} className="mt-3 grid gap-2 sm:grid-cols-2">
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
          <button className={`${primaryButtonClass} sm:col-span-2`}>{tCommon("save")}</button>
        </form>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("gopayTitle")}</h2>
        <form action={adminSaveGoPaySettingsAction} className="mt-3 grid gap-2 sm:grid-cols-2">
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
          <button className={`${primaryButtonClass} sm:col-span-2`}>{tCommon("save")}</button>
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
          <button className={`${primaryButtonClass} sm:col-span-2`}>{tCommon("save")}</button>
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
          <button className={`${primaryButtonClass} sm:col-span-2`}>{tCommon("save")}</button>
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
            <button className={`${primaryButtonClass} sm:col-span-2`}>{tCommon("save")}</button>
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
            <button className={`${primaryButtonClass} sm:col-span-2`}>{tCommon("save")}</button>
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
            <button className={`${primaryButtonClass} sm:col-span-2`}>{tCommon("save")}</button>
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
    </div>
  );
}
