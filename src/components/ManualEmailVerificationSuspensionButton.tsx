"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { adminRunEmailVerificationSuspensionAction, type ManualEmailVerificationSuspensionResult } from "@/app/actions";
import { StatusBanner } from "./StatusBanner";
import { ConfirmDialog } from "./ConfirmDialog";

export function ManualEmailVerificationSuspensionButton() {
  const t = useTranslations("admin.data");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ManualEmailVerificationSuspensionResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function confirmAndRun() {
    setConfirmOpen(false);
    setResult(null);
    startTransition(async () => {
      setResult(await adminRunEmailVerificationSuspensionAction());
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => setConfirmOpen(true)} disabled={pending} className="btn btn-primary w-fit">
        {pending ? t("manualEmailVerificationSuspensionRunning") : t("manualEmailVerificationSuspensionButton")}
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title={t("manualEmailVerificationSuspensionButton")}
        message={t("manualEmailVerificationSuspensionConfirm")}
        confirmLabel={tCommon("confirm")}
        cancelLabel={tCommon("cancel")}
        onConfirm={confirmAndRun}
        onCancel={() => setConfirmOpen(false)}
      />

      {result &&
        (result.ok ? (
          <StatusBanner>{t("manualEmailVerificationSuspensionSuccess", { count: result.suspendedCount })}</StatusBanner>
        ) : (
          <StatusBanner tone="danger">{result.message}</StatusBanner>
        ))}
    </div>
  );
}
