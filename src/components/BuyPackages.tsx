import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useTranslations, Trans } from "@/i18n/translations";
import { Link } from "@/i18n/navigation";
import type { createPaymentOrderAction } from "@/lib/actions/payments";
import { StatusBanner } from "./StatusBanner";
import { SharePaymentQrButton } from "./SharePaymentQrButton";

export type BuyablePackage = {
  id: string;
  kind: "CREDITS" | "PERIOD" | "FAMILY";
  credits: number;
  priceCzk: number;
  periodLabelKey: "periodWeek" | "periodMonth" | "periodYear" | "periodCustom";
};

/** A FAMILY package's optional companion — one of the buyer's own Doprovod entries. */
export type FamilyCompanion = { id: string; name: string; isChildCategory: boolean };

const FAMILY_ADULT_CAP = 1;
const FAMILY_CHILD_CAP = 3;

export function BuyPackages({
  packages,
  gopayEnabled,
  dependentId,
  familyCompanions = [],
}: {
  packages: BuyablePackage[];
  gopayEnabled: boolean;
  /** Buying on behalf of this dependent (companion) instead of the logged-in member themselves. */
  dependentId?: string;
  /** Candidates for a FAMILY package's companion picker — only ever passed for the "self" buyer. */
  familyCompanions?: FamilyCompanion[];
}) {
  const t = useTranslations("buy");
  const tCommon = useTranslations("common");
  const fetcher = useFetcher<typeof createPaymentOrderAction>();
  const pending = fetcher.state !== "idle";
  const result = fetcher.data ?? null;
  const [pendingPackageId, setPendingPackageId] = useState<string | null>(null);
  // The QR/result step opens in a popup that covers the rest of the package
  // list — separate from `pendingPackageId` (which package's fetcher call is
  // active/last) so closing the popup doesn't lose track of that.
  const [dialogOpen, setDialogOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Selected companion ids per FAMILY package id — capped client-side (1
  // adult + 3 children), re-validated server-side in createPaymentOrderAction
  // since a companion's category can change between render and submit.
  const [familySelections, setFamilySelections] = useState<Record<string, string[]>>({});

  function toggleFamilyCompanion(packageId: string, companion: FamilyCompanion) {
    setFamilySelections((prev) => {
      const current = prev[packageId] ?? [];
      if (current.includes(companion.id)) {
        return { ...prev, [packageId]: current.filter((id) => id !== companion.id) };
      }
      const cap = companion.isChildCategory ? FAMILY_CHILD_CAP : FAMILY_ADULT_CAP;
      const countInGroup = current.filter(
        (id) => familyCompanions.find((c) => c.id === id)?.isChildCategory === companion.isChildCategory,
      ).length;
      if (countInGroup >= cap) return prev;
      return { ...prev, [packageId]: [...current, companion.id] };
    });
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (dialogOpen && !dialog.open) dialog.showModal();
    if (!dialogOpen && dialog.open) dialog.close();
  }, [dialogOpen]);

  function buy(packageId: string, method: "QR" | "GOPAY") {
    setPendingPackageId(packageId);
    setDialogOpen(true);
    const formData = new FormData();
    formData.set("intent", "createPaymentOrder");
    formData.set("packageId", packageId);
    formData.set("method", method);
    if (dependentId) formData.set("dependentId", dependentId);
    for (const id of familySelections[packageId] ?? []) formData.append("familyDependentIds", id);
    fetcher.submit(formData, { method: "post" });
  }

  if (packages.length === 0) {
    return <p className="text-[var(--muted)]">{t("noPackages")}</p>;
  }

  const activePackage = packages.find((p) => p.id === pendingPackageId) ?? null;
  function packageTitle(pkg: BuyablePackage) {
    return pkg.kind === "CREDITS" ? t("creditsPackage", { count: pkg.credits }) : pkg.kind === "FAMILY" ? t("familyPackage") : t(pkg.periodLabelKey);
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      {packages.map((pkg) => {
        const isFamily = pkg.kind === "FAMILY";
        const selectedFamilyIds = familySelections[pkg.id] ?? [];
        const adultCompanions = familyCompanions.filter((c) => !c.isChildCategory);
        const childCompanions = familyCompanions.filter((c) => c.isChildCategory);
        const selectedAdultCount = selectedFamilyIds.filter((id) => !familyCompanions.find((c) => c.id === id)?.isChildCategory).length;
        const selectedChildCount = selectedFamilyIds.filter((id) => familyCompanions.find((c) => c.id === id)?.isChildCategory).length;
        // The FAMILY companion picker needs the full row's width on a narrow 2-col mobile grid.
        return (
          <div key={pkg.id} className={`card ${isFamily ? "col-span-2" : ""}`}>
            <p className="font-medium text-[var(--ink)]">{packageTitle(pkg)}</p>
            <p className="text-2xl font-bold text-[var(--brand-dark)]">{t("priceLabel", { price: pkg.priceCzk })}</p>

            {isFamily && (
              <fieldset className="mt-3 flex flex-col gap-2 rounded-lg border border-[var(--line)] p-3">
                <legend className="px-1 text-sm font-semibold text-[var(--brand-dark)]">{t("familyCompanionsLegend")}</legend>
                {familyCompanions.length === 0 && (
                  <p className="text-sm text-[var(--muted)]">
                    <Trans
                      t={t}
                      i18nKey="familyNoCompanions"
                      components={{ a: <Link href="/account#dependents" className="font-semibold underline" /> }}
                    />
                  </p>
                )}
                {adultCompanions.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-[var(--muted)]">
                      {t("familyAdultGroup", { max: FAMILY_ADULT_CAP })}
                    </span>
                    {adultCompanions.map((c) => {
                      const checked = selectedFamilyIds.includes(c.id);
                      return (
                        <label key={c.id} className="flex items-center gap-2 text-sm text-[var(--ink)]">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!checked && selectedAdultCount >= FAMILY_ADULT_CAP}
                            onChange={() => toggleFamilyCompanion(pkg.id, c)}
                            className="h-4 w-4 accent-[var(--brand)]"
                          />
                          <span>{c.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {childCompanions.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-[var(--muted)]">
                      {t("familyChildGroup", { max: FAMILY_CHILD_CAP })}
                    </span>
                    {childCompanions.map((c) => {
                      const checked = selectedFamilyIds.includes(c.id);
                      return (
                        <label key={c.id} className="flex items-center gap-2 text-sm text-[var(--ink)]">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!checked && selectedChildCount >= FAMILY_CHILD_CAP}
                            onChange={() => toggleFamilyCompanion(pkg.id, c)}
                            className="h-4 w-4 accent-[var(--brand)]"
                          />
                          <span>{c.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </fieldset>
            )}

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => buy(pkg.id, "QR")}
                disabled={pending}
                className={`btn flex-1 !px-3 !py-2 text-sm ${
                  pending && pendingPackageId === pkg.id
                    ? "btn-pending cursor-wait"
                    : "btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                }`}
              >
                {pending && pendingPackageId === pkg.id ? t("generatingQr") : t("buyByQr")}
              </button>
              {gopayEnabled && (
                <button
                  type="button"
                  onClick={() => buy(pkg.id, "GOPAY")}
                  disabled={pending}
                  className="btn btn-secondary flex-1 !px-3 !py-2 text-sm disabled:opacity-50"
                >
                  {pending && pendingPackageId === pkg.id ? "…" : t("buyByGoPay")}
                </button>
              )}
            </div>
          </div>
        );
      })}

      <dialog
        ref={dialogRef}
        className="confirm-dialog"
        onCancel={(e) => {
          e.preventDefault();
          setDialogOpen(false);
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) setDialogOpen(false);
        }}
      >
        {activePackage && (
          <div className="flex flex-col items-center gap-3 text-center">
            <h2 className="text-lg font-semibold text-[var(--ink)]">{packageTitle(activePackage)}</h2>
            <p className="text-2xl font-bold text-[var(--brand-dark)]">{t("priceLabel", { price: activePackage.priceCzk })}</p>

            {pending ? (
              // `fetcher.data` keeps the *previous* submission's result until
              // this one resolves — without gating on `pending` here, buying
              // a second package would flash the last package's QR/error
              // underneath "Generuji QR kód…" instead of just the spinner.
              <p className="text-sm text-[var(--muted)]">{t("generatingQr")}</p>
            ) : (
              <>
                {result && !result.ok && (
                  <StatusBanner tone="danger">{t(`errors.${result.error}` as Parameters<typeof t>[0])}</StatusBanner>
                )}

                {result && result.ok && result.method === "QR" && (
                  <div className="flex flex-col items-center gap-3 border-t border-[var(--line)] pt-3">
                    <img src={result.qr} alt="QR" width={220} height={220} />
                    <p className="text-[var(--ink)]">{t("qrAmount", { amount: result.amountCzk })}</p>
                    <p className="text-sm text-[var(--muted)]">{t("qrVs", { vs: result.vs })}</p>
                    <p className="text-xs text-[var(--muted)]">{t("qrNote")}</p>
                    <SharePaymentQrButton qr={result.qr} spd={result.spd} title={t("qrTitle")} />
                  </div>
                )}

                {result && result.ok && result.method === "GOPAY" && <StatusBanner tone="info">{t("gopayConfirmed")}</StatusBanner>}
              </>
            )}

            <button type="button" className="btn btn-secondary mt-1" onClick={() => setDialogOpen(false)}>
              {tCommon("close")}
            </button>
          </div>
        )}
      </dialog>
    </div>
  );
}
