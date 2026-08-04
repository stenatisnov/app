"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  adminRunConfigBackupAction,
  adminRunTransactionBackupAction,
  type ManualBackupResult,
} from "@/app/actions";
import { StatusBanner } from "./StatusBanner";

function BackupButton({
  label,
  running,
  action,
}: {
  label: string;
  running: string;
  action: () => Promise<ManualBackupResult>;
}) {
  const t = useTranslations("admin.data");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ManualBackupResult | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      setResult(await action());
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={handleClick} disabled={pending} className="btn btn-primary w-fit">
        {pending ? running : label}
      </button>
      {result && (result.ok ? <StatusBanner>{t("manualBackupSuccess")}</StatusBanner> : <StatusBanner tone="danger">{result.message}</StatusBanner>)}
    </div>
  );
}

export function ManualBackupButtons() {
  const t = useTranslations("admin.data");

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
      <BackupButton
        label={t("manualConfigBackupButton")}
        running={t("manualBackupRunning")}
        action={adminRunConfigBackupAction}
      />
      <BackupButton
        label={t("manualTransactionBackupButton")}
        running={t("manualBackupRunning")}
        action={adminRunTransactionBackupAction}
      />
    </div>
  );
}
