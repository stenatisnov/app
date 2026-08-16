import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/translations";
import type { openGuestGateAction } from "@/lib/actions/gate";
import { StatusBanner } from "./StatusBanner";
import { EntryOptionsDialog } from "./EntryOptionsDialog";
import { IdentityQrDialog } from "./IdentityQrDialog";

export function GuestOpenButton({ token, initialRemaining }: { token: string; initialRemaining: number }) {
  const t = useTranslations("guest");
  const fetcher = useFetcher<typeof openGuestGateAction>();
  const pending = fetcher.state !== "idle";
  const result = fetcher.data ?? null;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [identityQrOpen, setIdentityQrOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [remaining, setRemaining] = useState(initialRemaining);

  useEffect(() => {
    if (result?.ok) setRemaining(result.creditsLeft);
  }, [result]);

  function submit(openGate: boolean) {
    setDialogOpen(false);
    const fd = new FormData();
    fd.set("intent", "openGuestGate");
    fd.set("token", token);
    fd.set("openGate", String(openGate));
    fetcher.submit(fd, { method: "post" });
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
