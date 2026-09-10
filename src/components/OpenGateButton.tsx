import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/translations";
import type { openGateAction } from "@/lib/actions/gate";
import { StatusBanner } from "./StatusBanner";
import { OpenGateConfirmDialog } from "./OpenGateConfirmDialog";
import { IdentityQrDialog } from "./IdentityQrDialog";

export type DependentOption = { id: string; name: string; credits: number };

/**
 * Three always-visible sections rather than one button behind a picker
 * dialog: (1) who's entering — self (fixed, always included) plus any
 * companions, and the operating-rules agreement that gates the other two
 * sections; (2) "prove to staff"; (3) "open gate". Both section buttons
 * submit the exact same openGateForUser call as before (openGate=false /
 * true) — only the entry point moved out of a dialog onto the page itself.
 */
export function OpenGateButton({
  disabled = false,
  initialCredits,
  unlimitedAccess = false,
  isChildGroupMember = false,
  freeReentryToday = false,
  userEmail,
  dependents = [],
}: {
  disabled?: boolean;
  /** Remaining entries to show next to the member, or `null` for unlimited (admin) access. */
  initialCredits: number | null;
  /** ADMIN/ROOT: skips the operating-rules agreement and the "prove to staff" section — they don't need either. */
  unlimitedAccess?: boolean;
  /** Child-group members can't self-open the gate — see openGateForUser's childGroupId check — so the "Otevřít bránu" section is hidden, leaving only "prove to staff". */
  isChildGroupMember?: boolean;
  /**
   * The member already made a real (paid) entry earlier today, so
   * "daily unlimited entries" (see hasFreeReentryToday) makes this open
   * free for the rest of the day — pre-checks the agreement so the
   * sections read as available, and shows a note explaining why, instead
   * of looking disabled/needing another credit.
   */
  freeReentryToday?: boolean;
  /** The member's own email — shown as text and, alone or with selected companion ids, encoded into the "prove to staff" QR code. */
  userEmail: string;
  /** Companions (typically children) the member can bring in alongside themselves in the same action. */
  dependents?: DependentOption[];
}) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const fetcher = useFetcher<typeof openGateAction>();
  const pending = fetcher.state !== "idle";
  const result = fetcher.data ?? null;
  const [confirmOpenGateOpen, setConfirmOpenGateOpen] = useState(false);
  const [identityQrOpen, setIdentityQrOpen] = useState(false);
  const [agreed, setAgreed] = useState(unlimitedAccess || freeReentryToday);
  const [credits, setCredits] = useState(initialCredits);
  const [dependentCredits, setDependentCredits] = useState(() => new Map(dependents.map((d) => [d.id, d.credits])));
  const [selectedDependentIds, setSelectedDependentIds] = useState<string[]>([]);

  useEffect(() => {
    if (result?.ok) {
      if (initialCredits !== null) setCredits(result.creditsLeft);
      if (result.dependentsLeft) {
        const depleted = new Set(result.dependentsLeft.filter((dep) => dep.creditsLeft < 1).map((dep) => dep.dependentId));
        setDependentCredits((prev) => {
          const next = new Map(prev);
          for (const dep of result.dependentsLeft!) next.set(dep.dependentId, dep.creditsLeft);
          return next;
        });
        if (depleted.size > 0) {
          setSelectedDependentIds((prev) => prev.filter((id) => !depleted.has(id)));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  function toggleDependent(id: string) {
    setSelectedDependentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submit(openGate: boolean) {
    setConfirmOpenGateOpen(false);
    const fd = new FormData();
    fd.set("intent", "openGate");
    fd.set("openGate", String(openGate));
    for (const id of selectedDependentIds) fd.append("dependentIds", id);
    fetcher.submit(fd, { method: "post" });
  }

  const sectionButtonsDisabled = disabled || !agreed || pending;

  return (
    <div className="gate-stack flex flex-col gap-5">
      {!unlimitedAccess && (
        <section className="flex w-full max-w-xs flex-col gap-3 self-center rounded-xl border border-[var(--line)] bg-white/70 p-3.5 shadow-sm">
          <h3 className="text-sm font-semibold text-[var(--brand-dark)]">{t("whoEntersTitle")}</h3>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2.5 text-sm text-[var(--ink)]">
              <input
                type="checkbox"
                checked
                readOnly
                disabled
                className="h-4 w-4 accent-[var(--brand)] disabled:cursor-not-allowed"
              />
              <span>{t("selfLabel")}</span>
              <span className="ml-auto text-xs text-[var(--muted)]">
                {t("creditsLabel")}: {credits === null ? "∞" : credits}
              </span>
            </label>
            {dependents.length > 0 && (
              <fieldset className="dependents-picker flex flex-col gap-1.5">
                <legend className="px-1 text-xs font-medium text-[var(--muted)]">{t("dependentsLegend")}</legend>
                {dependents.map((dep) => {
                  const currentCredits = dependentCredits.get(dep.id) ?? dep.credits;
                  const depleted = currentCredits < 1;
                  return (
                    <label
                      key={dep.id}
                      className={`flex items-center gap-2.5 text-sm ${depleted ? "text-[var(--muted)] opacity-60" : "text-[var(--ink)]"}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDependentIds.includes(dep.id)}
                        onChange={() => toggleDependent(dep.id)}
                        disabled={depleted}
                        className="h-4 w-4 accent-[var(--brand)] disabled:cursor-not-allowed"
                      />
                      <span>{dep.name}</span>
                      <span className="ml-auto text-xs text-[var(--muted)]">
                        {t("creditsLabel")}: {currentCredits}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}
          </div>

          {freeReentryToday && <p className="text-xs text-[var(--muted)]">{t("freeReentryToday")}</p>}

          <label className="flex items-start gap-2.5 text-sm text-[var(--danger)]">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4.5 w-4.5 shrink-0 accent-[var(--danger)]"
            />
            <span className="font-medium leading-snug">{t("agreementLabel")}</span>
          </label>
        </section>
      )}

      {!unlimitedAccess && (
        <section className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => setIdentityQrOpen(true)}
            disabled={sectionButtonsDisabled}
            className="btn btn-secondary w-full max-w-xs flex-col disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>{t("dialogEnterOnly")}</span>
            <span className="text-xs font-normal opacity-70">{t("dialogEnterOnlyNote")}</span>
          </button>
        </section>
      )}

      {!isChildGroupMember && (
        <section className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpenGateOpen(true)}
            disabled={sectionButtonsDisabled}
            className="btn btn-open max-w-xs flex-col disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-2xl sm:text-3xl">{pending ? t("opening") : t("dialogOpenGate")}</span>
            <span className="text-sm font-normal opacity-85">{t("dialogOpenGateNote")}</span>
          </button>
        </section>
      )}

      <OpenGateConfirmDialog
        open={confirmOpenGateOpen}
        confirmMessage={t("confirmOpenGateMessage")}
        checkingLabel={t("checkingGate")}
        offlineHint={t("gateOfflineHint")}
        yesLabel={tCommon("yes")}
        noLabel={tCommon("no")}
        pending={pending}
        onConfirm={() => submit(true)}
        onCancel={() => setConfirmOpenGateOpen(false)}
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
