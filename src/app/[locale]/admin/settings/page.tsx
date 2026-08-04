import { getTranslations } from "next-intl/server";
import { getGoPaySettingsStored, getLockSettings, getQrPaymentSettings, goPayEnvOverrides } from "@/lib/settings";
import { adminSaveGoPaySettingsAction, adminSaveLockSettingsAction, adminSaveQrSettingsAction } from "@/app/actions";
import { requireRoot } from "@/lib/session";

const inputClass = "input !py-1 text-sm";
const primaryButtonClass = "w-fit btn btn-primary !px-3 !py-1.5 text-xs";

export default async function AdminSettingsPage() {
  await requireRoot();
  const t = await getTranslations("admin.settings");
  const tCommon = await getTranslations("common");
  const [lock, qr, gopay, gopayOverrides] = await Promise.all([
    getLockSettings(),
    getQrPaymentSettings(),
    getGoPaySettingsStored(),
    Promise.resolve(goPayEnvOverrides()),
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
    </div>
  );
}
