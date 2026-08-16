import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/i18n.client";
import type { createPaymentOrderAction } from "@/lib/actions/payments";
import { StatusBanner } from "./StatusBanner";
import { SharePaymentQrButton } from "./SharePaymentQrButton";

export type BuyablePackage = {
  id: string;
  kind: "CREDITS" | "PERIOD";
  credits: number;
  priceCzk: number;
  periodLabelKey: "periodWeek" | "periodMonth" | "periodYear" | "periodCustom";
};

export function BuyPackages({
  packages,
  gopayEnabled,
  dependentId,
}: {
  packages: BuyablePackage[];
  gopayEnabled: boolean;
  /** Buying on behalf of this dependent (companion) instead of the logged-in member themselves. */
  dependentId?: string;
}) {
  const t = useTranslations("buy");
  const fetcher = useFetcher<typeof createPaymentOrderAction>();
  const pending = fetcher.state !== "idle";
  const result = fetcher.data ?? null;
  const [pendingPackageId, setPendingPackageId] = useState<string | null>(null);
  // Once a QR has been generated for a package, its Buy button stays disabled
  // for the rest of this page load — an impatient extra tap (or a duplicate
  // scan) must not create a second pending order for the same purchase. This
  // is deliberately permanent, not a timed cooldown: only reloading the page
  // (a fresh mount, fresh state) re-enables it.
  const [qrGeneratedFor, setQrGeneratedFor] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (result?.ok && result.method === "QR" && pendingPackageId) {
      setQrGeneratedFor((prev) => new Set(prev).add(pendingPackageId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  function buy(packageId: string, method: "QR" | "GOPAY") {
    setPendingPackageId(packageId);
    const formData = new FormData();
    formData.set("intent", "createPaymentOrder");
    formData.set("packageId", packageId);
    formData.set("method", method);
    if (dependentId) formData.set("dependentId", dependentId);
    fetcher.submit(formData, { method: "post" });
  }

  if (packages.length === 0) {
    return <p className="text-[var(--muted)]">{t("noPackages")}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      {packages.map((pkg) => {
        const pkgResult = pendingPackageId === pkg.id ? result : null;
        const qrDisabled = qrGeneratedFor.has(pkg.id);
        // A visible QR/result block needs the full row's width on a narrow 2-col mobile grid.
        const showsResult = Boolean(pkgResult);
        return (
          <div key={pkg.id} className={`card ${showsResult ? "col-span-2" : ""}`}>
            <p className="font-medium text-[var(--ink)]">
              {pkg.kind === "CREDITS" ? t("creditsPackage", { count: pkg.credits }) : t(pkg.periodLabelKey)}
            </p>
            <p className="text-2xl font-bold text-[var(--brand-dark)]">{t("priceLabel", { price: pkg.priceCzk })}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => buy(pkg.id, "QR")}
                disabled={pending || qrDisabled}
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
            {qrDisabled && <p className="mt-1 text-xs text-[var(--muted)]">{t("qrCooldownHint")}</p>}

            {pkgResult && !pkgResult.ok && (
              <StatusBanner tone="danger">{t(`errors.${pkgResult.error}` as Parameters<typeof t>[0])}</StatusBanner>
            )}

            {pkgResult && pkgResult.ok && pkgResult.method === "QR" && (
              <div className="mt-3 flex flex-col items-center gap-3 border-t border-[var(--line)] pt-3 text-center">
                <h3 className="font-medium text-[var(--ink)]">{t("qrTitle")}</h3>
                <img src={pkgResult.qr} alt="QR" width={220} height={220} />
                <p className="text-[var(--ink)]">{t("qrAmount", { amount: pkgResult.amountCzk })}</p>
                <p className="text-sm text-[var(--muted)]">{t("qrVs", { vs: pkgResult.vs })}</p>
                <p className="text-xs text-[var(--muted)]">{t("qrNote")}</p>
                <SharePaymentQrButton qr={pkgResult.qr} spd={pkgResult.spd} title={t("qrTitle")} />
              </div>
            )}

            {pkgResult && pkgResult.ok && pkgResult.method === "GOPAY" && (
              <div className="mt-3">
                <StatusBanner tone="info">{t("gopayConfirmed")}</StatusBanner>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
