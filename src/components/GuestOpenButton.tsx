"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { openGuestGateAction } from "@/app/actions";
import { StatusBanner } from "./StatusBanner";
import { ConfirmDialog } from "./ConfirmDialog";

type Result = Awaited<ReturnType<typeof openGuestGateAction>>;

export function GuestOpenButton({ token }: { token: string }) {
  const t = useTranslations("guest");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function confirmAndOpen() {
    setConfirmOpen(false);
    startTransition(async () => {
      setResult(await openGuestGateAction(token));
    });
  }

  return (
    <div className="gate-stack flex flex-col items-center gap-4">
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={pending || (result?.ok === false && result.code === "USED_UP")}
        className="btn btn-open max-w-xs disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? t("opening") : t("openButton")}
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
      {result?.ok && <StatusBanner tone="info">{t("remainingUses", { count: result.creditsLeft })}</StatusBanner>}
    </div>
  );
}
