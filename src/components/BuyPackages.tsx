import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useTranslations, Trans } from "@/i18n/translations";
import { Link } from "@/i18n/navigation";
import type { createPlatbaOrderAction } from "@/lib/actions/payments";
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

/** One of the buyer's own active CREDITS packages, offered as a Platba quantity choice. */
export type CreditsOption = { id: string; credits: number; priceCzk: number };

/** The buyer ("self") or one of their own Doprovod, each with their own CREDITS packages to choose from for Platba. */
export type PlatbaPerson = { recipientId: string; label: string; creditsOptions: CreditsOption[] };

const FAMILY_ADULT_CAP = 1;
const FAMILY_CHILD_CAP = 3;

function defaultPackageId(options: CreditsOption[]): string {
  return (options.find((o) => o.credits === 1) ?? options[0])?.id ?? "";
}

export function BuyPackages({
  platbaPeople,
  periodPackages,
  familyPackage,
  familyCompanions = [],
  gopayEnabled,
}: {
  /** Buyer + Doprovod, each with their own CREDITS packages — the unified "Platba" purchase. */
  platbaPeople: PlatbaPerson[];
  /** The buyer's own active PERIOD packages — self only, unrelated to Platba. */
  periodPackages: BuyablePackage[];
  /** The buyer's own FAMILY package, if any — self only, unrelated to Platba. */
  familyPackage: BuyablePackage | null;
  /** Candidates for the FAMILY package's companion picker. */
  familyCompanions?: FamilyCompanion[];
  gopayEnabled: boolean;
}) {
  const t = useTranslations("buy");
  const tCommon = useTranslations("common");
  // Both purchase actions return an identical success shape (they share the
  // same finalizeOrder tail server-side) and only differ in which specific
  // error strings they can return — picking one as the fetcher's type param
  // is enough, since `result.error` below is always read generically.
  const fetcher = useFetcher<typeof createPlatbaOrderAction>();
  const pending = fetcher.state !== "idle";
  const result = fetcher.data ?? null;

  // Which purchase is in flight / was last submitted — the popup and each
  // buy button's own loading state key off this instead of a single
  // packageId, since Platba has no single package to identify it by.
  const [activeKind, setActiveKind] = useState<"period" | "family" | "platba" | null>(null);
  const [pendingPackageId, setPendingPackageId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // FAMILY companion picker — capped client-side (1 adult + 3 children),
  // re-validated server-side since a companion's category can change
  // between render and submit.
  const [familySelectedIds, setFamilySelectedIds] = useState<string[]>([]);

  function toggleFamilyCompanion(companion: FamilyCompanion) {
    setFamilySelectedIds((prev) => {
      if (prev.includes(companion.id)) return prev.filter((id) => id !== companion.id);
      const cap = companion.isChildCategory ? FAMILY_CHILD_CAP : FAMILY_ADULT_CAP;
      const countInGroup = prev.filter((id) => familyCompanions.find((c) => c.id === id)?.isChildCategory === companion.isChildCategory).length;
      if (countInGroup >= cap) return prev;
      return [...prev, companion.id];
    });
  }

  // Platba — one include/exclude + package choice per person. Self defaults
  // included with "1 vstup" preselected; companions default excluded (but
  // still get a sensible preselected package, in case they're checked).
  const [platbaSelections, setPlatbaSelections] = useState<Record<string, { checked: boolean; packageId: string }>>(() =>
    Object.fromEntries(
      platbaPeople.map((p) => [p.recipientId, { checked: p.recipientId === "self", packageId: defaultPackageId(p.creditsOptions) }]),
    ),
  );

  function togglePlatbaChecked(recipientId: string) {
    setPlatbaSelections((prev) => ({ ...prev, [recipientId]: { ...prev[recipientId], checked: !prev[recipientId].checked } }));
  }

  function setPlatbaPackage(recipientId: string, packageId: string) {
    setPlatbaSelections((prev) => ({ ...prev, [recipientId]: { ...prev[recipientId], packageId } }));
  }

  const platbaTotal = platbaPeople.reduce((sum, p) => {
    const sel = platbaSelections[p.recipientId];
    if (!sel?.checked) return sum;
    return sum + (p.creditsOptions.find((o) => o.id === sel.packageId)?.priceCzk ?? 0);
  }, 0);
  const platbaHasSelection = platbaPeople.some((p) => platbaSelections[p.recipientId]?.checked);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (dialogOpen && !dialog.open) dialog.showModal();
    if (!dialogOpen && dialog.open) dialog.close();
  }, [dialogOpen]);

  function buyPeriodOrFamily(kind: "period" | "family", pkg: BuyablePackage, method: "QR" | "GOPAY") {
    setActiveKind(kind);
    setPendingPackageId(pkg.id);
    setDialogOpen(true);
    const formData = new FormData();
    formData.set("intent", "createPaymentOrder");
    formData.set("packageId", pkg.id);
    formData.set("method", method);
    if (kind === "family") {
      for (const id of familySelectedIds) formData.append("familyDependentIds", id);
    }
    fetcher.submit(formData, { method: "post" });
  }

  function buyPlatba(method: "QR" | "GOPAY") {
    setActiveKind("platba");
    setPendingPackageId(null);
    setDialogOpen(true);
    const formData = new FormData();
    formData.set("intent", "createPlatbaOrder");
    formData.set("method", method);
    for (const p of platbaPeople) {
      const sel = platbaSelections[p.recipientId];
      if (sel?.checked) formData.append("items", `${p.recipientId}:${sel.packageId}`);
    }
    fetcher.submit(formData, { method: "post" });
  }

  if (platbaPeople.length === 0 && periodPackages.length === 0 && !familyPackage) {
    return <p className="text-[var(--muted)]">{t("noPackages")}</p>;
  }

  function packageTitle(pkg: BuyablePackage) {
    return pkg.kind === "FAMILY" ? t("familyPackage") : t(pkg.periodLabelKey);
  }

  const activePackage: BuyablePackage | null =
    activeKind === "period" ? (periodPackages.find((p) => p.id === pendingPackageId) ?? null) : activeKind === "family" ? familyPackage : null;
  const dialogTitle = activeKind === "platba" ? t("platbaTitle") : activePackage ? packageTitle(activePackage) : "";
  const dialogPrice = activeKind === "platba" ? platbaTotal : (activePackage?.priceCzk ?? 0);

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      {platbaPeople.length > 0 && (
        <div className="card col-span-2">
          <p className="font-medium text-[var(--ink)]">{t("platbaTitle")}</p>
          <p className="text-2xl font-bold text-[var(--brand-dark)]">{t("priceLabel", { price: platbaTotal })}</p>

          <div className="mt-3 flex flex-col gap-2">
            {platbaPeople.map((p) => {
              const sel = platbaSelections[p.recipientId];
              return (
                <div key={p.recipientId} className="flex items-center gap-2">
                  <label className="flex flex-1 items-center gap-2 text-sm text-[var(--ink)]">
                    <input
                      type="checkbox"
                      checked={sel?.checked ?? false}
                      onChange={() => togglePlatbaChecked(p.recipientId)}
                      className="h-4 w-4 accent-[var(--brand)]"
                    />
                    <span>{p.label}</span>
                  </label>
                  <select
                    value={sel?.packageId ?? ""}
                    onChange={(e) => setPlatbaPackage(p.recipientId, e.target.value)}
                    disabled={!sel?.checked}
                    className="input !w-auto !py-1.5 text-sm"
                  >
                    {p.creditsOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {t("platbaOptionLabel", { count: o.credits, price: o.priceCzk })}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => buyPlatba("QR")}
              disabled={pending || !platbaHasSelection}
              className={`btn flex-1 !px-3 !py-2 text-sm ${
                pending && activeKind === "platba" ? "btn-pending cursor-wait" : "btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              }`}
            >
              {pending && activeKind === "platba" ? t("generatingQr") : t("buyByQr")}
            </button>
            {gopayEnabled && (
              <button
                type="button"
                onClick={() => buyPlatba("GOPAY")}
                disabled={pending || !platbaHasSelection}
                className="btn btn-secondary flex-1 !px-3 !py-2 text-sm disabled:opacity-50"
              >
                {pending && activeKind === "platba" ? "…" : t("buyByGoPay")}
              </button>
            )}
          </div>
        </div>
      )}

      {periodPackages.map((pkg) => (
        <div key={pkg.id} className="card">
          <p className="font-medium text-[var(--ink)]">{t(pkg.periodLabelKey)}</p>
          <p className="text-2xl font-bold text-[var(--brand-dark)]">{t("priceLabel", { price: pkg.priceCzk })}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => buyPeriodOrFamily("period", pkg, "QR")}
              disabled={pending}
              className={`btn flex-1 !px-3 !py-2 text-sm ${
                pending && pendingPackageId === pkg.id ? "btn-pending cursor-wait" : "btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              }`}
            >
              {pending && pendingPackageId === pkg.id ? t("generatingQr") : t("buyByQr")}
            </button>
            {gopayEnabled && (
              <button
                type="button"
                onClick={() => buyPeriodOrFamily("period", pkg, "GOPAY")}
                disabled={pending}
                className="btn btn-secondary flex-1 !px-3 !py-2 text-sm disabled:opacity-50"
              >
                {pending && pendingPackageId === pkg.id ? "…" : t("buyByGoPay")}
              </button>
            )}
          </div>
        </div>
      ))}

      {familyPackage && (
        <div className="card col-span-2">
          <p className="font-medium text-[var(--ink)]">{t("familyPackage")}</p>
          <p className="text-2xl font-bold text-[var(--brand-dark)]">{t("priceLabel", { price: familyPackage.priceCzk })}</p>

          <fieldset className="mt-3 flex flex-col gap-2 rounded-lg border border-[var(--line)] p-3">
            <legend className="px-1 text-sm font-semibold text-[var(--brand-dark)]">{t("familyCompanionsLegend")}</legend>
            {familyCompanions.length === 0 && (
              <p className="text-sm text-[var(--muted)]">
                <Trans t={t} i18nKey="familyNoCompanions" components={{ a: <Link href="/account#dependents" className="font-semibold underline" /> }} />
              </p>
            )}
            {familyCompanions.filter((c) => !c.isChildCategory).length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--muted)]">{t("familyAdultGroup", { max: FAMILY_ADULT_CAP })}</span>
                {familyCompanions
                  .filter((c) => !c.isChildCategory)
                  .map((c) => {
                    const checked = familySelectedIds.includes(c.id);
                    const countInGroup = familySelectedIds.filter((id) => !familyCompanions.find((x) => x.id === id)?.isChildCategory).length;
                    return (
                      <label key={c.id} className="flex items-center gap-2 text-sm text-[var(--ink)]">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!checked && countInGroup >= FAMILY_ADULT_CAP}
                          onChange={() => toggleFamilyCompanion(c)}
                          className="h-4 w-4 accent-[var(--brand)]"
                        />
                        <span>{c.name}</span>
                      </label>
                    );
                  })}
              </div>
            )}
            {familyCompanions.filter((c) => c.isChildCategory).length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--muted)]">{t("familyChildGroup", { max: FAMILY_CHILD_CAP })}</span>
                {familyCompanions
                  .filter((c) => c.isChildCategory)
                  .map((c) => {
                    const checked = familySelectedIds.includes(c.id);
                    const countInGroup = familySelectedIds.filter((id) => familyCompanions.find((x) => x.id === id)?.isChildCategory).length;
                    return (
                      <label key={c.id} className="flex items-center gap-2 text-sm text-[var(--ink)]">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!checked && countInGroup >= FAMILY_CHILD_CAP}
                          onChange={() => toggleFamilyCompanion(c)}
                          className="h-4 w-4 accent-[var(--brand)]"
                        />
                        <span>{c.name}</span>
                      </label>
                    );
                  })}
              </div>
            )}
          </fieldset>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => buyPeriodOrFamily("family", familyPackage, "QR")}
              disabled={pending}
              className={`btn flex-1 !px-3 !py-2 text-sm ${
                pending && pendingPackageId === familyPackage.id ? "btn-pending cursor-wait" : "btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              }`}
            >
              {pending && pendingPackageId === familyPackage.id ? t("generatingQr") : t("buyByQr")}
            </button>
            {gopayEnabled && (
              <button
                type="button"
                onClick={() => buyPeriodOrFamily("family", familyPackage, "GOPAY")}
                disabled={pending}
                className="btn btn-secondary flex-1 !px-3 !py-2 text-sm disabled:opacity-50"
              >
                {pending && pendingPackageId === familyPackage.id ? "…" : t("buyByGoPay")}
              </button>
            )}
          </div>
        </div>
      )}

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
        {activeKind && (
          <div className="flex flex-col items-center gap-3 text-center">
            <h2 className="text-lg font-semibold text-[var(--ink)]">{dialogTitle}</h2>
            <p className="text-2xl font-bold text-[var(--brand-dark)]">{t("priceLabel", { price: dialogPrice })}</p>

            {pending ? (
              // `fetcher.data` keeps the *previous* submission's result until
              // this one resolves — without gating on `pending` here, buying
              // a second package would flash the last package's QR/error
              // underneath "Generuji QR kód…" instead of just the spinner.
              <p className="text-sm text-[var(--muted)]">{t("generatingQr")}</p>
            ) : (
              <>
                {result && !result.ok && <StatusBanner tone="danger">{t(`errors.${result.error}` as Parameters<typeof t>[0])}</StatusBanner>}

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
