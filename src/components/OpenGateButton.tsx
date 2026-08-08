"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { openGateAction } from "@/app/actions";
import { StatusBanner } from "./StatusBanner";
import { EntryOptionsDialog } from "./EntryOptionsDialog";
import { IdentityQrDialog } from "./IdentityQrDialog";

type Result = Awaited<ReturnType<typeof openGateAction>>;

export type DependentOption = { id: string; name: string; credits: number };

export function OpenGateButton({
  disabled = false,
  initialCredits,
  unlimitedAccess = false,
  userEmail,
  dependents = [],
}: {
  disabled?: boolean;
  /** Remaining entries to show on the button, or `null` for unlimited (admin) access. */
  initialCredits: number | null;
  /** STAFF/ADMIN/ROOT: skips the operating-rules agreement and the "prove to staff" option — they don't need either. */
  unlimitedAccess?: boolean;
  /** The member's own email — shown as text and, alone or with selected companion ids, encoded into the "prove to staff" QR code. */
  userEmail: string;
  /** Companions (typically children) the member can bring in alongside themselves in the same action. */
  dependents?: DependentOption[];
}) {
  const t = useTranslations("dashboard");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [identityQrOpen, setIdentityQrOpen] = useState(false);
  const [agreed, setAgreed] = useState(unlimitedAccess);
  const [credits, setCredits] = useState(initialCredits);
  const [dependentCredits, setDependentCredits] = useState(() => new Map(dependents.map((d) => [d.id, d.credits])));
  const [selectedDependentIds, setSelectedDependentIds] = useState<string[]>([]);

  function toggleDependent(id: string) {
    setSelectedDependentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submit(openGate: boolean) {
    setDialogOpen(false);
    startTransition(async () => {
      const res = await openGateAction(openGate, selectedDependentIds);
      setResult(res);
      if (res.ok) {
        if (initialCredits !== null) setCredits(res.creditsLeft);
        if (res.dependentsLeft) {
          setDependentCredits((prev) => {
            const next = new Map(prev);
            for (const dep of res.dependentsLeft!) next.set(dep.dependentId, dep.creditsLeft);
            return next;
          });
        }
      }
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

      {!unlimitedAccess && dependents.length > 0 && (
        <fieldset className="flex max-w-xs flex-col gap-1.5 rounded-lg border border-[var(--line)] px-3 py-2.5 text-sm">
          <legend className="px-1 text-xs font-medium text-[var(--muted)]">{t("dependentsLegend")}</legend>
          {dependents.map((dep) => (
            <label key={dep.id} className="flex items-center gap-2 text-[var(--ink)]">
              <input
                type="checkbox"
                checked={selectedDependentIds.includes(dep.id)}
                onChange={() => toggleDependent(dep.id)}
              />
              {dep.name} ({t("creditsLabel")}: {dependentCredits.get(dep.id) ?? dep.credits})
            </label>
          ))}
        </fieldset>
      )}

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
        value={selectedDependentIds.length > 0 ? `${userEmail}|${selectedDependentIds.join(",")}` : userEmail}
        displayValue={userEmail}
        title={t("identityQrTitle")}
        hint={t("identityQrHint")}
        closeLabel={t("identityQrClose")}
        onClose={() => setIdentityQrOpen(false)}
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
