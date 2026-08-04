"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { openGuestGateAction } from "@/app/actions";
import { StatusBanner } from "./StatusBanner";
import { ConfirmDialog } from "./ConfirmDialog";

type Result = Awaited<ReturnType<typeof openGuestGateAction>>;

export function GuestOpenButton({ token, initialRemaining }: { token: string; initialRemaining: number }) {
  const t = useTranslations("guest");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [remaining, setRemaining] = useState(initialRemaining);

  function confirmAndOpen() {
    setConfirmOpen(false);
    startTransition(async () => {
      const res = await openGuestGateAction(token);
      setResult(res);
      if (res.ok) setRemaining(res.creditsLeft);
    });
  }

  return (
    <div className="gate-stack flex flex-col items-center gap-4">
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={pending || remaining <= 0}
        className="btn btn-open max-w-xs flex-col disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>{pending ? t("opening") : t("openButton")}</span>
        <span className="text-sm font-normal opacity-85">{t("remainingUses", { count: remaining })}</span>
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title={t("openButton")}
        message={t("confirmOpen")}
        confirmLabel={tCommon("confirm")}
        cancelLabel={tCommon("cancel")}
        onConfirm={confirmAndOpen}
        onCancel={() => setConfirmOpen(false)}
      />

      {result && !result.ok && (
        <StatusBanner tone="danger">
          {t.has(`errors.${result.code}`) ? t(`errors.${result.code}` as Parameters<typeof t>[0]) : result.message}
        </StatusBanner>
      )}
      {result?.ok && (
        <StatusBanner tone="info">{result.simulated ? t("openedSimulated") : t("openedSuccess")}</StatusBanner>
      )}
    </div>
  );
}
