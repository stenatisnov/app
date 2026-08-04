"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { adminRunLogCleanupAction, type ManualLogCleanupResult } from "@/app/actions";
import { StatusBanner } from "./StatusBanner";
import { ConfirmDialog } from "./ConfirmDialog";

export function ManualLogCleanupButton() {
  const t = useTranslations("admin.data");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ManualLogCleanupResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function confirmAndRun() {
    setConfirmOpen(false);
    setResult(null);
    startTransition(async () => {
      setResult(await adminRunLogCleanupAction());
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => setConfirmOpen(true)} disabled={pending} className="btn btn-primary w-fit">
        {pending ? t("manualLogCleanupRunning") : t("manualLogCleanupButton")}
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title={t("manualLogCleanupButton")}
        message={t("manualLogCleanupConfirm")}
        confirmLabel={tCommon("confirm")}
        cancelLabel={tCommon("cancel")}
        onConfirm={confirmAndRun}
        onCancel={() => setConfirmOpen(false)}
      />

      {result &&
        (result.ok ? (
          <StatusBanner>{t("manualLogCleanupSuccess", { count: result.deletedCount })}</StatusBanner>
        ) : (
          <StatusBanner tone="danger">{result.message}</StatusBanner>
        ))}
    </div>
  );
}
