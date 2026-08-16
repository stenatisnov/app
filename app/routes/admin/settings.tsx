import { Form, data } from "react-router";
import type { Route } from "./+types/settings";
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
  getWcCodeSettingsStored,
  goPayEnvOverrides,
} from "@/lib/settings";
import {
  adminCheckGateStatusAction,
  adminRunFioPollAction,
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
  adminSaveWcCodeSettingsAction,
} from "@/lib/actions/admin-settings";
import { requireRoot } from "@/lib/session.server";
import { withLoadContext } from "@/lib/request-context.server";
import { formatAppDateTime } from "@/lib/time";
import { getGateStatus } from "@/lib/lock";
import { useTranslations } from "@/i18n/i18n.client";
import { SaveButton } from "@/components/SaveButton";
import { GateStatusCard } from "@/components/GateStatusCard";
import { FioPollButton } from "@/components/FioPollButton";

const inputClass = "input !py-1 text-sm";
const primaryButtonClass = "w-fit btn btn-primary !px-3 !py-1.5 text-xs";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    await requireRoot(request, params.locale!);
    const lock = await getLockSettings();
    const [
      gateStatus,
      qr,
      paymentControl,
      wcCode,
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
    ] = await Promise.all([
      getGateStatus(lock),
      getQrPaymentSettings(),
      getPaymentControlSettings(),
      getWcCodeSettingsStored(),
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

    return data({
      lock,
      gateStatus,
      qr,
      paymentControl,
      wcCode,
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
    });
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    await requireRoot(request, params.locale!);
    const formData = await request.formData();
    const intent = String(formData.get("intent"));
    switch (intent) {
      case "checkGateStatus":
        return adminCheckGateStatusAction();
      case "runFioPoll":
        return adminRunFioPollAction();
      case "saveLockSettings":
        return adminSaveLockSettingsAction(formData);
      case "saveQrSettings":
        return adminSaveQrSettingsAction(formData);
      case "saveFioSettings":
        return adminSaveFioSettingsAction(formData);
      case "savePaymentControlSettings":
        return adminSavePaymentControlSettingsAction(formData);
      case "saveWcCodeSettings":
        return adminSaveWcCodeSettingsAction(formData);
      case "saveRegistrationSettings":
        return adminSaveRegistrationSettingsAction(formData);
      case "saveNotificationSettings":
        return adminSaveNotificationSettingsAction(formData);
      case "saveGoPaySettings":
        return adminSaveGoPaySettingsAction(formData);
      case "saveSmtpSettings":
        return adminSaveSmtpSettingsAction(formData);
      case "saveS3Settings":
        return adminSaveS3SettingsAction(formData);
      case "saveConfigBackupSettings":
        return adminSaveConfigBackupSettingsAction(formData);
      case "saveTransactionBackupSettings":
        return adminSaveTransactionBackupSettingsAction(formData);
      case "saveDatabaseDumpSettings":
        return adminSaveDatabaseDumpSettingsAction(formData);
      case "saveLogCleanupSettings":
        return adminSaveLogCleanupSettingsAction(formData);
      case "savePendingOrderCleanupSettings":
        return adminSavePendingOrderCleanupSettingsAction(formData);
      case "saveEmailVerificationSettings":
        return adminSaveEmailVerificationSettingsAction(formData);
      case "savePaymentReceiptSettings":
        return adminSavePaymentReceiptSettingsAction(formData);
      default:
        throw data(null, { status: 400 });
    }
  });
}

export default function AdminSettingsPage({ loaderData, params }: Route.ComponentProps) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const dateLocale = params.locale === "en" ? "en-GB" : "cs-CZ";
  const {
    lock,
    gateStatus,
    qr,
    paymentControl,
    wcCode,
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
  } = loaderData;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("settings.title")}</h1>

      <section className="card">
        <h2 className="text-lg font-medium">{t("settings.lockTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("settings.lockHint")}</p>
        <Form method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="intent" value="saveLockSettings" />
          <label className="flex flex-col text-xs text-[var(--muted)] sm:col-span-2">
            {t("settings.lockAgentUrl")}
            <input name="agentUrl" defaultValue={lock.agentUrl} placeholder="https://gate-ctrl.example.org" className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)] sm:col-span-2">
            {t("settings.lockAgentToken")}
            <input name="agentToken" defaultValue={lock.agentToken} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.lockCooldown")}
            <input name="cooldownSec" type="number" defaultValue={lock.cooldownSec} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.lockTimeout")}
            <input name="timeoutMs" type="number" defaultValue={lock.timeoutMs} className={inputClass} />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="dailyUnlimitedEntries" defaultChecked={lock.dailyUnlimitedEntries} />
            {t("settings.lockDailyUnlimitedEntries")}
          </label>
          <p className="text-xs text-[var(--muted)] sm:col-span-2">{t("settings.lockDailyUnlimitedEntriesHint")}</p>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="sm:col-span-2"
          />
        </Form>
        <GateStatusCard initialStatus={gateStatus} />
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("settings.qrTitle")}</h2>
        <Form method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="intent" value="saveQrSettings" />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="quickPaymentEnabled" defaultChecked={qr.quickPaymentEnabled} />
            {t("settings.qrQuickPaymentEnabled")}
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.qrAccountNumber")}
            <input name="accountNumber" defaultValue={qr.accountNumber} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.qrBankCode")}
            <input name="bankCode" defaultValue={qr.bankCode} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.qrMessageTemplate")}
            <input name="messageTemplate" defaultValue={qr.messageTemplate} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.qrVsPrefix")}
            <input name="vsPrefix" defaultValue={qr.vsPrefix} className={inputClass} />
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="sm:col-span-2"
          />
        </Form>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("settings.fioTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("settings.fioHint")}</p>
        <Form method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="intent" value="saveFioSettings" />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked={fio.enabled} />
            {t("settings.fioEnabled")}
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.fioToken")}
            <input name="token" type="password" placeholder={fio.token ? "••••••••" : ""} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.fioPollInterval")}
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
        </Form>
        <p className="mt-3 text-xs text-[var(--muted)]">
          {fio.lastRunAt
            ? t("settings.fioLastRun", { date: formatAppDateTime(new Date(fio.lastRunAt), dateLocale), count: fio.lastMatchedCount })
            : t("settings.fioNever")}
        </p>
        {fio.lastError && (
          <p className="mt-1 text-xs text-[var(--danger)]">
            {t("settings.fioLastError", { date: formatAppDateTime(new Date(fio.lastErrorAt), dateLocale) })}: {fio.lastError}
          </p>
        )}
        <FioPollButton />
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("settings.paymentControlTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("settings.paymentControlHint")}</p>
        <Form method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="intent" value="savePaymentControlSettings" />
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.paymentControlPeriodDays")}
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
        </Form>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("settings.wcCodeTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("settings.wcCodeHint")}</p>
        <Form method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="intent" value="saveWcCodeSettings" />
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.wcCodeLabel")}
            <input
              name="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              defaultValue={wcCode.code}
              className={inputClass}
            />
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="sm:col-span-2"
          />
        </Form>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("settings.registrationTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("settings.registrationHint")}</p>
        <Form method="post" className="mt-3 grid gap-2">
          <input type="hidden" name="intent" value="saveRegistrationSettings" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="autoApprove" defaultChecked={registration.autoApprove} />
            {t("settings.registrationAutoApprove")}
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="w-fit"
          />
        </Form>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("settings.notificationsTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("settings.notificationsHint")}</p>
        <Form method="post" className="mt-3 grid gap-2">
          <input type="hidden" name="intent" value="saveNotificationSettings" />
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.notificationsRecipients")}
            <textarea
              name="recipients"
              defaultValue={notifications.recipients.join("\n")}
              placeholder={t("settings.notificationsRecipientsHint")}
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
        </Form>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("settings.gopayTitle")}</h2>
        <Form method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="intent" value="saveGoPaySettings" />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked={gopay.enabled} />
            {t("settings.gopayEnabled")}
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.gopayGoid")} {gopayOverrides.goid && <span className="text-amber-600">({t("settings.envOverrideNote")})</span>}
            <input name="goid" defaultValue={gopay.goid} disabled={gopayOverrides.goid} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.gopayClientId")}{" "}
            {gopayOverrides.clientId && <span className="text-amber-600">({t("settings.envOverrideNote")})</span>}
            <input name="clientId" defaultValue={gopay.clientId} disabled={gopayOverrides.clientId} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.gopayClientSecret")}{" "}
            {gopayOverrides.clientSecret && <span className="text-amber-600">({t("settings.envOverrideNote")})</span>}
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
            {t("settings.gopaySandbox")}
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="sm:col-span-2"
          />
        </Form>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("settings.smtpTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("settings.smtpHint")}</p>
        <Form method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="intent" value="saveSmtpSettings" />
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.smtpHost")}
            <input name="host" defaultValue={smtp.host} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.smtpPort")}
            <input name="port" type="number" defaultValue={smtp.port} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.smtpUser")}
            <input name="user" defaultValue={smtp.user} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.smtpPass")}
            <input name="pass" type="password" placeholder={smtp.pass ? "••••••••" : ""} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)] sm:col-span-2">
            {t("settings.smtpFrom")}
            <input name="from" defaultValue={smtp.from} placeholder={t("settings.smtpFromHint")} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)] sm:col-span-2">
            {t("settings.smtpAccountId")}
            <input name="accountId" defaultValue={smtp.accountId} placeholder={t("settings.smtpAccountIdHint")} className={inputClass} />
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="sm:col-span-2"
          />
        </Form>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("settings.s3Title")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("settings.s3Hint")}</p>
        <Form method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="intent" value="saveS3Settings" />
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.s3Bucket")}
            <input name="bucket" defaultValue={s3.bucket} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.s3Region")}
            <input name="region" defaultValue={s3.region} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.s3Endpoint")}
            <input name="endpoint" defaultValue={s3.endpoint} placeholder={t("settings.s3EndpointHint")} className={inputClass} />
          </label>
          <div />
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.s3AccessKeyId")}
            <input name="accessKeyId" defaultValue={s3.accessKeyId} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.s3SecretAccessKey")}
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
        </Form>

        <div className="mt-6 border-t border-[var(--line)] pt-4">
          <h3 className="text-sm font-medium">{t("settings.configBackupTitle")}</h3>
          <Form method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="intent" value="saveConfigBackupSettings" />
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="enabled" defaultChecked={configBackup.enabled} />
              {t("settings.backupEnabled")}
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("settings.backupPath")}
              <input name="path" defaultValue={configBackup.path} placeholder={t("settings.backupPathHint")} className={inputClass} />
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("settings.backupFrequency")}
              <input
                name="frequencyMinutes"
                type="number"
                min={1}
                defaultValue={configBackup.frequencyMinutes}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("settings.backupKeepCount")}
              <input name="keepCount" type="number" min={1} defaultValue={configBackup.keepCount} className={inputClass} />
            </label>
            <SaveButton
              label={tCommon("save")}
              savedLabel={tCommon("saved")}
              buttonClassName={primaryButtonClass}
              wrapperClassName="sm:col-span-2"
            />
          </Form>
          <p className="mt-3 text-xs text-[var(--muted)]">
            {configBackup.lastRunAt
              ? t("settings.backupLastRun", { date: formatAppDateTime(new Date(configBackup.lastRunAt), dateLocale) })
              : t("settings.backupNever")}
          </p>
          {configBackup.lastError && (
            <p className="mt-1 text-xs text-[var(--danger)]">
              {t("settings.backupLastError", { date: formatAppDateTime(new Date(configBackup.lastErrorAt), dateLocale) })}:{" "}
              {configBackup.lastError}
            </p>
          )}
        </div>

        <div className="mt-6 border-t border-[var(--line)] pt-4">
          <h3 className="text-sm font-medium">{t("settings.txBackupTitle")}</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">{t("settings.txBackupHint")}</p>
          <Form method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="intent" value="saveTransactionBackupSettings" />
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="enabled" defaultChecked={transactionBackup.enabled} />
              {t("settings.backupEnabled")}
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("settings.backupPath")}
              <input
                name="path"
                defaultValue={transactionBackup.path}
                placeholder={t("settings.backupPathHint")}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("settings.backupFrequency")}
              <input
                name="frequencyMinutes"
                type="number"
                min={1}
                defaultValue={transactionBackup.frequencyMinutes}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("settings.backupKeepCount")}
              <input
                name="keepCount"
                type="number"
                min={1}
                defaultValue={transactionBackup.keepCount}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("settings.txBackupRetentionDays")}
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
          </Form>
          <p className="mt-3 text-xs text-[var(--muted)]">
            {transactionBackup.lastRunAt
              ? t("settings.backupLastRun", { date: formatAppDateTime(new Date(transactionBackup.lastRunAt), dateLocale) })
              : t("settings.backupNever")}
          </p>
          {transactionBackup.lastError && (
            <p className="mt-1 text-xs text-[var(--danger)]">
              {t("settings.backupLastError", { date: formatAppDateTime(new Date(transactionBackup.lastErrorAt), dateLocale) })}:{" "}
              {transactionBackup.lastError}
            </p>
          )}
        </div>

        <div className="mt-6 border-t border-[var(--line)] pt-4">
          <h3 className="text-sm font-medium">{t("settings.dbDumpTitle")}</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">{t("settings.dbDumpHint")}</p>
          <Form method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="intent" value="saveDatabaseDumpSettings" />
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="enabled" defaultChecked={databaseDump.enabled} />
              {t("settings.backupEnabled")}
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("settings.backupPath")}
              <input
                name="path"
                defaultValue={databaseDump.path}
                placeholder={t("settings.backupPathHint")}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("settings.dbDumpFrequencyDays")}
              <input
                name="frequencyDays"
                type="number"
                min={1}
                defaultValue={databaseDump.frequencyDays}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("settings.dbDumpTimeOfDay")}
              <input name="timeOfDay" type="time" defaultValue={databaseDump.timeOfDay} className={inputClass} />
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t("settings.backupKeepCount")}
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
          </Form>
          <p className="mt-3 text-xs text-[var(--muted)]">
            {databaseDump.lastRunAt
              ? t("settings.backupLastRun", { date: formatAppDateTime(new Date(databaseDump.lastRunAt), dateLocale) })
              : t("settings.backupNever")}
          </p>
          {databaseDump.lastError && (
            <p className="mt-1 text-xs text-[var(--danger)]">
              {t("settings.backupLastError", { date: formatAppDateTime(new Date(databaseDump.lastErrorAt), dateLocale) })}:{" "}
              {databaseDump.lastError}
            </p>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("settings.logCleanupTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("settings.logCleanupHint")}</p>
        <Form method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="intent" value="saveLogCleanupSettings" />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked={logCleanup.enabled} />
            {t("settings.logCleanupEnabled")}
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.logCleanupMaxAgeDays")}
            <input name="maxAgeDays" type="number" min={1} defaultValue={logCleanup.maxAgeDays} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.logCleanupFrequencyDays")}
            <input
              name="frequencyDays"
              type="number"
              min={1}
              defaultValue={logCleanup.frequencyDays}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.logCleanupTimeOfDay")}
            <input name="timeOfDay" type="time" defaultValue={logCleanup.timeOfDay} className={inputClass} />
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="sm:col-span-2"
          />
        </Form>
        <p className="mt-3 text-xs text-[var(--muted)]">
          {logCleanup.lastRunAt
            ? t("settings.logCleanupLastRun", {
                date: formatAppDateTime(new Date(logCleanup.lastRunAt), dateLocale),
                count: logCleanup.lastDeletedCount,
              })
            : t("settings.logCleanupNever")}
        </p>
        {logCleanup.lastError && (
          <p className="mt-1 text-xs text-[var(--danger)]">
            {t("settings.logCleanupLastError", { date: formatAppDateTime(new Date(logCleanup.lastErrorAt), dateLocale) })}:{" "}
            {logCleanup.lastError}
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("settings.pendingOrderCleanupTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("settings.pendingOrderCleanupHint")}</p>
        <Form method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="intent" value="savePendingOrderCleanupSettings" />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked={pendingOrderCleanup.enabled} />
            {t("settings.pendingOrderCleanupEnabled")}
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.pendingOrderCleanupMaxAgeHours")}
            <input
              name="maxAgeHours"
              type="number"
              min={1}
              defaultValue={pendingOrderCleanup.maxAgeHours}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.pendingOrderCleanupFrequencyHours")}
            <input
              name="frequencyHours"
              type="number"
              min={1}
              defaultValue={pendingOrderCleanup.frequencyHours}
              className={inputClass}
            />
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="sm:col-span-2"
          />
        </Form>
        <p className="mt-3 text-xs text-[var(--muted)]">
          {pendingOrderCleanup.lastRunAt
            ? t("settings.pendingOrderCleanupLastRun", {
                date: formatAppDateTime(new Date(pendingOrderCleanup.lastRunAt), dateLocale),
                count: pendingOrderCleanup.lastDeletedCount,
              })
            : t("settings.pendingOrderCleanupNever")}
        </p>
        {pendingOrderCleanup.lastError && (
          <p className="mt-1 text-xs text-[var(--danger)]">
            {t("settings.pendingOrderCleanupLastError", {
              date: formatAppDateTime(new Date(pendingOrderCleanup.lastErrorAt), dateLocale),
            })}
            : {pendingOrderCleanup.lastError}
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("settings.emailVerificationTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("settings.emailVerificationHint")}</p>
        <Form method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="intent" value="saveEmailVerificationSettings" />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked={emailVerification.enabled} />
            {t("settings.emailVerificationEnabled")}
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.emailVerificationGraceDays")}
            <input
              name="graceDays"
              type="number"
              min={1}
              defaultValue={emailVerification.graceDays}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.emailVerificationFrequencyDays")}
            <input
              name="frequencyDays"
              type="number"
              min={1}
              defaultValue={emailVerification.frequencyDays}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.emailVerificationTimeOfDay")}
            <input name="timeOfDay" type="time" defaultValue={emailVerification.timeOfDay} className={inputClass} />
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="sm:col-span-2"
          />
        </Form>
        <p className="mt-3 text-xs text-[var(--muted)]">
          {emailVerification.lastRunAt
            ? t("settings.emailVerificationLastRun", {
                date: formatAppDateTime(new Date(emailVerification.lastRunAt), dateLocale),
                count: emailVerification.lastSuspendedCount,
              })
            : t("settings.emailVerificationNever")}
        </p>
        {emailVerification.lastError && (
          <p className="mt-1 text-xs text-[var(--danger)]">
            {t("settings.emailVerificationLastError", {
              date: formatAppDateTime(new Date(emailVerification.lastErrorAt), dateLocale),
            })}
            : {emailVerification.lastError}
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("settings.paymentReceiptTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("settings.paymentReceiptHint")}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("settings.paymentReceiptPlaceholders")}</p>
        <Form method="post" className="mt-3 flex flex-col gap-2">
          <input type="hidden" name="intent" value="savePaymentReceiptSettings" />
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.paymentReceiptSubject")}
            <input name="subject" defaultValue={paymentReceipt.subject} className={inputClass} />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            {t("settings.paymentReceiptBody")}
            <textarea name="pdfText" defaultValue={paymentReceipt.pdfText} rows={8} className={`${inputClass} font-mono`} />
          </label>
          <SaveButton
            label={tCommon("save")}
            savedLabel={tCommon("saved")}
            buttonClassName={primaryButtonClass}
            wrapperClassName="w-fit"
          />
        </Form>
      </section>
    </div>
  );
}
