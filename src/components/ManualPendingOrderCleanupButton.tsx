"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { adminRunPendingOrderCleanupAction, type ManualPendingOrderCleanupResult } from "@/app/actions";
import { StatusBanner } from "./StatusBanner";
import { ConfirmDialog } from "./ConfirmDialog";

export function ManualPendingOrderCleanupButton() {
  const t = useTranslations("admin.data");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ManualPendingOrderCleanupResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function confirmAndRun() {
    setConfirmOpen(false);
    setResult(null);
    startTransition(async () => {
      setResult(await adminRunPendingOrderCleanupAction());
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => setConfirmOpen(true)} disabled={pending} className="btn btn-primary w-fit">
        {pending ? t("manualPendingOrderCleanupRunning") : t("manualPendingOrderCleanupButton")}
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title={t("manualPendingOrderCleanupButton")}
        message={t("manualPendingOrderCleanupConfirm")}
        confirmLabel={tCommon("confirm")}
        cancelLabel={tCommon("cancel")}
        onConfirm={confirmAndRun}
        onCancel={() => setConfirmOpen(false)}
      />

      {result &&
        (result.ok ? (
          <StatusBanner>{t("manualPendingOrderCleanupSuccess", { count: result.deletedCount })}</StatusBanner>
        ) : (
          <StatusBanner tone="danger">{result.message}</StatusBanner>
        ))}
    </div>
  );
}
