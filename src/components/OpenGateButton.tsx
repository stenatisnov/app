"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { openGateAction } from "@/app/actions";
import { StatusBanner } from "./StatusBanner";
import { EntryOptionsDialog } from "./EntryOptionsDialog";
import { IdentityQrDialog } from "./IdentityQrDialog";

type Result = Awaited<ReturnType<typeof openGateAction>>;

export function OpenGateButton({
  disabled = false,
  initialCredits,
  unlimitedAccess = false,
  userEmail,
}: {
  disabled?: boolean;
  /** Remaining entries to show on the button, or `null` for unlimited (admin) access. */
  initialCredits: number | null;
  /** STAFF/ADMIN/ROOT: skips the operating-rules agreement and the "prove to staff" option — they don't need either. */
  unlimitedAccess?: boolean;
  /** Encoded into the "prove to staff" QR code — the member's own email. */
  userEmail: string;
}) {
  const t = useTranslations("dashboard");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [identityQrOpen, setIdentityQrOpen] = useState(false);
  const [agreed, setAgreed] = useState(unlimitedAccess);
  const [credits, setCredits] = useState(initialCredits);

  function submit(openGate: boolean) {
    setDialogOpen(false);
    startTransition(async () => {
      const res = await openGateAction(openGate);
      setResult(res);
      if (res.ok && initialCredits !== null) setCredits(res.creditsLeft);
    });
  }

  return (
    <div className="gate-stack flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        disabled={disabled || !agreed || pending}
        className="btn btn-open max-w-xs flex-col disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>{pending ? t("opening") : t("openButton")}</span>
        <span className="text-sm font-normal opacity-85">
          {t("creditsLabel")}: {credits === null ? "∞" : credits}
        </span>
      </button>

      {!unlimitedAccess && (
        <label className="flex max-w-xs items-start gap-2 text-[1.35rem] text-[var(--danger)]">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1.5"
          />
          {t("agreementLabel")}
        </label>
      )}

      <EntryOptionsDialog
        open={dialogOpen}
        title={t("openButton")}
        openGateLabel={t("dialogOpenGate")}
        enterOnlyLabel={t("dialogEnterOnly")}
        cancelLabel={t("dialogCancel")}
        checkingLabel={t("checkingGate")}
        offlineHint={t("gateOfflineHint")}
        pending={pending}
        showEnterOnly={!unlimitedAccess}
        onOpenGate={() => submit(true)}
        onEnterOnly={() => {
          setDialogOpen(false);
          setIdentityQrOpen(true);
        }}
        onCancel={() => setDialogOpen(false)}
      />

      <IdentityQrDialog
        open={identityQrOpen}
        value={userEmail}
        title={t("identityQrTitle")}
        hint={t("identityQrHint")}
        closeLabel={t("identityQrClose")}
        onClose={() => setIdentityQrOpen(false)}
      />

      {result && !result.ok && (
        <StatusBanner tone="danger">
          {t.has(`errors.${result.code}`)
            ? t(`errors.${result.code}` as Parameters<typeof t>[0])
            : result.message}
        </StatusBanner>
      )}
      {result && result.ok && (
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
