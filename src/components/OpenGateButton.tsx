import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/translations";
import type { openGateAction } from "@/lib/actions/gate";
import { StatusBanner } from "./StatusBanner";
import { EntryOptionsDialog } from "./EntryOptionsDialog";
import { IdentityQrDialog } from "./IdentityQrDialog";

export type DependentOption = { id: string; name: string; credits: number };

export function OpenGateButton({
  disabled = false,
  initialCredits,
  unlimitedAccess = false,
  freeReentryToday = false,
  userEmail,
  dependents = [],
}: {
  disabled?: boolean;
  /** Remaining entries to show on the button, or `null` for unlimited (admin) access. */
  initialCredits: number | null;
  /** ADMIN/ROOT: skips the operating-rules agreement and the "prove to staff" option — they don't need either. */
  unlimitedAccess?: boolean;
  /**
   * The member already made a real (paid) entry earlier today, so
   * "daily unlimited entries" (see hasFreeReentryToday) makes this open
   * free for the rest of the day — pre-checks the agreement so the button
   * reads as available, and shows a note explaining why, instead of
   * looking disabled/needing another credit.
   */
  freeReentryToday?: boolean;
  /** The member's own email — shown as text and, alone or with selected companion ids, encoded into the "prove to staff" QR code. */
  userEmail: string;
  /** Companions (typically children) the member can bring in alongside themselves in the same action. */
  dependents?: DependentOption[];
}) {
  const t = useTranslations("dashboard");
  const fetcher = useFetcher<typeof openGateAction>();
  const pending = fetcher.state !== "idle";
  const result = fetcher.data ?? null;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [identityQrOpen, setIdentityQrOpen] = useState(false);
  const [agreed, setAgreed] = useState(unlimitedAccess || freeReentryToday);
  const [credits, setCredits] = useState(initialCredits);
  const [dependentCredits, setDependentCredits] = useState(() => new Map(dependents.map((d) => [d.id, d.credits])));
  const [selectedDependentIds, setSelectedDependentIds] = useState<string[]>([]);

  useEffect(() => {
    if (result?.ok) {
      if (initialCredits !== null) setCredits(result.creditsLeft);
      if (result.dependentsLeft) {
        setDependentCredits((prev) => {
          const next = new Map(prev);
          for (const dep of result.dependentsLeft!) next.set(dep.dependentId, dep.creditsLeft);
          return next;
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  function toggleDependent(id: string) {
    setSelectedDependentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submit(openGate: boolean) {
    setDialogOpen(false);
    const fd = new FormData();
    fd.set("intent", "openGate");
    fd.set("openGate", String(openGate));
    for (const id of selectedDependentIds) fd.append("dependentIds", id);
    fetcher.submit(fd, { method: "post" });
  }

  return (
    <div className="gate-stack flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        disabled={disabled || !agreed || pending}
        className="btn btn-open max-w-xs flex-col disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="text-2xl sm:text-3xl">{pending ? t("opening") : t("openButton")}</span>
        <span className="text-sm font-normal opacity-85">
          {t("creditsLabel")}: {credits === null ? "∞" : credits}
        </span>
        {freeReentryToday && <span className="text-xs font-normal opacity-85">{t("freeReentryToday")}</span>}
      </button>

      {!unlimitedAccess && (
        <div className="flex w-full max-w-xs flex-col gap-3 pt-1 sm:rounded-xl sm:border sm:border-[var(--line)] sm:bg-white/70 sm:p-3.5 sm:shadow-sm">
          {dependents.length > 0 && (
            <>
              <fieldset className="dependents-picker flex flex-col gap-1.5">
                <legend className="px-1 text-sm font-semibold text-[var(--brand-dark)]">{t("dependentsLegend")}</legend>
                {dependents.map((dep) => (
                  <label key={dep.id} className="flex items-center gap-2.5 text-sm text-[var(--ink)]">
                    <input
                      type="checkbox"
                      checked={selectedDependentIds.includes(dep.id)}
                      onChange={() => toggleDependent(dep.id)}
                      className="h-4 w-4 accent-[var(--brand)]"
                    />
                    <span>{dep.name}</span>
                    <span className="ml-auto text-xs text-[var(--muted)]">
                      {t("creditsLabel")}: {dependentCredits.get(dep.id) ?? dep.credits}
                    </span>
                  </label>
                ))}
              </fieldset>
              <hr className="border-t border-[var(--line)]" />
            </>
          )}

          <label className="flex items-start gap-2.5 text-sm text-[var(--danger)]">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4.5 w-4.5 shrink-0 accent-[var(--danger)]"
            />
            <span className="font-medium leading-snug">{t("agreementLabel")}</span>
          </label>
        </div>
      )}

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
        value={selectedDependentIds.length > 0 ? `${userEmail}|${selectedDependentIds.join(",")}` : userEmail}
        displayValue={userEmail}
        title={t("identityQrTitle")}
        hint={t("identityQrHint")}
        closeLabel={t("identityQrClose")}
        // Staff scans this on their own device and deducts the credit there —
        // this device has no way to know it happened, so reload to show the
        // real remaining count instead of the stale pre-scan one.
        onClose={() => window.location.reload()}
      />

      {result && !result.ok && (
        <StatusBanner tone="danger">
          {result.code === "NO_CREDITS_DEPENDENT" && result.dependentName
            ? t("errors.NO_CREDITS_DEPENDENT", { name: result.dependentName })
            : t.has(`errors.${result.code}`)
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
