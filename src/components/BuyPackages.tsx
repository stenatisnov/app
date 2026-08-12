"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createPaymentOrderAction } from "@/app/actions";
import { StatusBanner } from "./StatusBanner";
import { SharePaymentQrButton } from "./SharePaymentQrButton";

export type BuyablePackage = {
  id: string;
  kind: "CREDITS" | "PERIOD";
  credits: number;
  priceCzk: number;
  periodLabelKey: "periodWeek" | "periodMonth" | "periodYear" | "periodCustom";
};

type OrderResult = Awaited<ReturnType<typeof createPaymentOrderAction>>;

/** How long the QR-buy button stays disabled after a successful order, so an impatient extra tap can't create a second payment for the same package. */
const QR_COOLDOWN_MS = 10_000;

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
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<OrderResult | null>(null);
  const [pendingPackageId, setPendingPackageId] = useState<string | null>(null);
  // Timestamp (not a boolean flag) the cooldown ends at, per package — lets us
  // re-derive "still cooling down?" on demand instead of trusting a setTimeout
  // to have fired. A member typically backgrounds the tab right after this to
  // scan the QR in their banking app, and browsers throttle or fully suspend
  // timers in backgrounded tabs, so the setTimeout below can arrive minutes
  // late (or, on some mobile browsers, only once the tab is foregrounded
  // again) — without this, the button could look permanently stuck disabled.
  const [qrCooldownUntil, setQrCooldownUntil] = useState<Record<string, number>>({});
  const [, forceRecheck] = useState(0);

  useEffect(() => {
    function recheckCooldowns() {
      if (document.visibilityState === "visible") forceRecheck((n) => n + 1);
    }
    document.addEventListener("visibilitychange", recheckCooldowns);
    return () => document.removeEventListener("visibilitychange", recheckCooldowns);
  }, []);

  function buy(packageId: string, method: "QR" | "GOPAY") {
    setPendingPackageId(packageId);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("packageId", packageId);
      formData.set("method", method);
      if (dependentId) formData.set("dependentId", dependentId);
      const res = await createPaymentOrderAction(formData);
      setResult(res);
      if (method === "QR" && res.ok) {
        const until = Date.now() + QR_COOLDOWN_MS;
        setQrCooldownUntil((prev) => ({ ...prev, [packageId]: until }));
        setTimeout(() => {
          setQrCooldownUntil((prev) => {
            if (prev[packageId] !== until) return prev;
            return Object.fromEntries(Object.entries(prev).filter(([id]) => id !== packageId));
          });
        }, QR_COOLDOWN_MS);
      }
    });
  }

  if (packages.length === 0) {
    return <p className="text-[var(--muted)]">{t("noPackages")}</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {packages.map((pkg) => {
        const pkgResult = pendingPackageId === pkg.id ? result : null;
        const qrCoolingDown = (qrCooldownUntil[pkg.id] ?? 0) > Date.now();
        return (
          <div key={pkg.id} className="card">
            <p className="font-medium text-[var(--ink)]">
              {pkg.kind === "CREDITS" ? t("creditsPackage", { count: pkg.credits }) : t(pkg.periodLabelKey)}
            </p>
            <p className="text-2xl font-bold text-[var(--brand-dark)]">{t("priceLabel", { price: pkg.priceCzk })}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => buy(pkg.id, "QR")}
                disabled={pending || qrCoolingDown}
                className={`btn flex-1 !px-3 !py-2 text-sm disabled:opacity-90 ${
                  pending && pendingPackageId === pkg.id ? "btn-pending disabled:cursor-wait" : "btn-primary disabled:cursor-not-allowed disabled:opacity-50"
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
            {qrCoolingDown && <p className="mt-1 text-xs text-[var(--muted)]">{t("qrCooldownHint")}</p>}

            {pkgResult && !pkgResult.ok && (
              <StatusBanner tone="danger">{t(`errors.${pkgResult.error}` as Parameters<typeof t>[0])}</StatusBanner>
            )}

            {pkgResult && pkgResult.ok && pkgResult.method === "QR" && (
              <div className="mt-3 flex flex-col items-center gap-3 border-t border-[var(--line)] pt-3 text-center">
                <h3 className="font-medium text-[var(--ink)]">{t("qrTitle")}</h3>
                <Image src={pkgResult.qr} alt="QR" width={220} height={220} unoptimized />
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
