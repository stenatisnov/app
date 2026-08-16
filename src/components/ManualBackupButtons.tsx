import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/i18n.client";
import type { adminRunConfigBackupAction } from "@/lib/actions/admin-settings";
import { StatusBanner } from "./StatusBanner";

function BackupButton({ label, running, intent }: { label: string; running: string; intent: string }) {
  const t = useTranslations("admin");
  const fetcher = useFetcher<typeof adminRunConfigBackupAction>();
  const pending = fetcher.state !== "idle";
  const result = fetcher.data ?? null;

  function handleClick() {
    const fd = new FormData();
    fd.set("intent", intent);
    fetcher.submit(fd, { method: "post" });
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={handleClick} disabled={pending} className="btn btn-primary w-fit">
        {pending ? running : label}
      </button>
      {result && (result.ok ? <StatusBanner>{t("data.manualBackupSuccess")}</StatusBanner> : <StatusBanner tone="danger">{result.message}</StatusBanner>)}
    </div>
  );
}

export function ManualBackupButtons() {
  const t = useTranslations("admin");

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
      <BackupButton label={t("data.manualConfigBackupButton")} running={t("data.manualBackupRunning")} intent="configBackup" />
      <BackupButton label={t("data.manualTransactionBackupButton")} running={t("data.manualBackupRunning")} intent="transactionBackup" />
      <BackupButton label={t("data.manualDatabaseDumpButton")} running={t("data.manualBackupRunning")} intent="databaseDump" />
    </div>
  );
}
