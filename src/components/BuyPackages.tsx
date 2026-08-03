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

export function BuyPackages({ packages }: { packages: BuyablePackage[] }) {
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
    return <p className="text-neutral-500">{t("noPackages")}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {packages.map((pkg) => (
          <div key={pkg.id} className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <p className="font-medium">
              {pkg.kind === "CREDITS" ? t("creditsPackage", { count: pkg.credits }) : t(pkg.periodLabelKey)}
            </p>
            <p className="text-2xl font-bold">{t("priceLabel", { price: pkg.priceCzk })}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => buy(pkg.id, "QR")}
                disabled={pending}
                className="flex-1 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {pending && pendingPackageId === pkg.id ? "…" : t("buyByQr")}
              </button>
              <button
                type="button"
                onClick={() => buy(pkg.id, "GOPAY")}
                disabled={pending}
                className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium disabled:opacity-50 dark:border-neutral-700"
              >
                {pending && pendingPackageId === pkg.id ? "…" : t("buyByGoPay")}
              </button>
            </div>
          </div>
        ))}
      </div>

      {result && !result.ok && (
        <StatusBanner tone="danger">{t(`errors.${result.error}` as Parameters<typeof t>[0])}</StatusBanner>
      )}

      {result && result.ok && result.method === "QR" && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-neutral-200 p-6 text-center dark:border-neutral-800">
          <h3 className="font-medium">{t("qrTitle")}</h3>
          <Image src={result.qr} alt="QR" width={220} height={220} unoptimized />
          <p>{t("qrAmount", { amount: result.amountCzk })}</p>
          <p className="text-sm text-neutral-500">{t("qrVs", { vs: result.vs })}</p>
          <p className="text-xs text-neutral-400">{t("qrNote")}</p>
          <SharePaymentQrButton spd={result.spd} title={t("qrTitle")} />
        </div>
      )}

      {result && result.ok && result.method === "GOPAY" && (
        <StatusBanner tone="info">{t("gopayConfirmed")}</StatusBanner>
      )}
    </div>
  );
}
