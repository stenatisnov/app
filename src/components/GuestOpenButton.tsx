"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { openGuestGateAction } from "@/app/actions";
import { StatusBanner } from "./StatusBanner";
import { EntryOptionsDialog } from "./EntryOptionsDialog";
import { IdentityQrDialog } from "./IdentityQrDialog";

type Result = Awaited<ReturnType<typeof openGuestGateAction>>;

export function GuestOpenButton({ token, initialRemaining }: { token: string; initialRemaining: number }) {
  const t = useTranslations("guest");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [identityQrOpen, setIdentityQrOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [remaining, setRemaining] = useState(initialRemaining);

  function submit(openGate: boolean) {
    setDialogOpen(false);
    startTransition(async () => {
      const res = await openGuestGateAction(token, openGate);
      setResult(res);
      if (res.ok) setRemaining(res.creditsLeft);
    });
  }

  return (
    <div className="gate-stack flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        disabled={pending || !agreed || remaining <= 0}
        className="btn btn-open max-w-xs flex-col disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>{pending ? t("opening") : t("openButton")}</span>
        <span className="text-sm font-normal opacity-85">{t("remainingUses", { count: remaining })}</span>
      </button>

      <label className="flex max-w-xs items-start gap-2 text-xs text-[var(--muted)]">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5"
        />
        {t("agreementLabel")}
      </label>

      <EntryOptionsDialog
        open={dialogOpen}
        title={t("openButton")}
        openGateLabel={t("dialogOpenGate")}
        openGateNote={t("dialogOpenGateNote")}
        openGateConfirmMessage={t("confirmOpenGateMessage")}
        enterOnlyLabel={t("dialogEnterOnly")}
        enterOnlyNote={t("dialogEnterOnlyNote")}
        cancelLabel={t("dialogCancel")}
        checkingLabel={t("checkingGate")}
        offlineHint={t("gateOfflineHint")}
        pending={pending}
        onOpenGate={() => submit(true)}
        onEnterOnly={() => {
          setDialogOpen(false);
          setIdentityQrOpen(true);
        }}
        onCancel={() => setDialogOpen(false)}
      />

      <IdentityQrDialog
        open={identityQrOpen}
        value={token}
        title={t("identityQrTitle")}
        hint={t("identityQrHint")}
        closeLabel={t("identityQrClose")}
        // Staff scans this on their own device and deducts the use there —
        // this device has no way to know it happened, so reload to show the
        // real remaining count instead of the stale pre-scan one.
        onClose={() => window.location.reload()}
      />

      {result && !result.ok && (
        <StatusBanner tone="danger">
          {t.has(`errors.${result.code}`) ? t(`errors.${result.code}` as Parameters<typeof t>[0]) : result.message}
        </StatusBanner>
      )}
      {result?.ok && (
        <StatusBanner tone="info">
          {result.gateOpened
            ? result.simulated
              ? t("openedSimulated")
              : t("openedSuccess")
            : t("enteredWithoutOpening")}
        </StatusBanner>
      )}
    </div>
  );
}
