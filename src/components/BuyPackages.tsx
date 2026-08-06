"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
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

export function BuyPackages({ packages, gopayEnabled }: { packages: BuyablePackage[]; gopayEnabled: boolean }) {
  const t = useTranslations("buy");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<OrderResult | null>(null);
  const [pendingPackageId, setPendingPackageId] = useState<string | null>(null);

  function buy(packageId: string, method: "QR" | "GOPAY") {
    setPendingPackageId(packageId);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("packageId", packageId);
      formData.set("method", method);
      const res = await createPaymentOrderAction(formData);
      setResult(res);
    });
  }

  if (packages.length === 0) {
    return <p className="text-[var(--muted)]">{t("noPackages")}</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {packages.map((pkg) => {
        const pkgResult = pendingPackageId === pkg.id ? result : null;
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
                disabled={pending}
                className="btn btn-primary flex-1 !px-3 !py-2 text-sm disabled:opacity-50"
              >
                {pending && pendingPackageId === pkg.id ? "…" : t("buyByQr")}
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
