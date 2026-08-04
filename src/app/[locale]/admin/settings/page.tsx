import { getLocale, getTranslations } from "next-intl/server";
import { getBackupSettingsStored, getGoPaySettingsStored, getLockSettings, getQrPaymentSettings, goPayEnvOverrides } from "@/lib/settings";
import {
  adminSaveBackupSettingsAction,
  adminSaveGoPaySettingsAction,
  adminSaveLockSettingsAction,
  adminSaveQrSettingsAction,
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
  const [lock, qr, gopay, gopayOverrides, backup] = await Promise.all([
    getLockSettings(),
    getQrPaymentSettings(),
    getGoPaySettingsStored(),
    Promise.resolve(goPayEnvOverrides()),
    getBackupSettingsStored(),
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
        <h2 className="text-lg font-medium">{t("backupTitle")}</h2>
        <form action={adminSaveBackupSettingsAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked={backup.enabled} />
            {t("backupEnabled")}
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("backupBucket")}
            <input name="bucket" defaultValue={backup.bucket} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("backupRegion")}
            <input name="region" defaultValue={backup.region} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("backupEndpoint")}
            <input name="endpoint" defaultValue={backup.endpoint} placeholder={t("backupEndpointHint")} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("backupPath")}
            <input name="path" defaultValue={backup.path} placeholder={t("backupPathHint")} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("backupFrequency")}
            <input
              name="frequencyMinutes"
              type="number"
              min={1}
              defaultValue={backup.frequencyMinutes}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("backupAccessKeyId")}
            <input name="accessKeyId" defaultValue={backup.accessKeyId} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("backupSecretAccessKey")}
            <input
              name="secretAccessKey"
              type="password"
              placeholder={backup.secretAccessKey ? "••••••••" : ""}
              className={inputClass}
            />
          </label>
          <button className={`${primaryButtonClass} sm:col-span-2`}>{tCommon("save")}</button>
        </form>
        <p className="mt-3 text-xs text-[var(--muted)]">
          {backup.lastRunAt
            ? t("backupLastRun", { date: formatAppDateTime(new Date(backup.lastRunAt), dateLocale) })
            : t("backupNever")}
        </p>
        {backup.lastError && (
          <p className="mt-1 text-xs text-[var(--danger)]">
            {t("backupLastError", { date: formatAppDateTime(new Date(backup.lastErrorAt), dateLocale) })}: {backup.lastError}
          </p>
        )}
      </section>
    </div>
  );
}
