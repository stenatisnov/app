"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { generateQuickPaymentQrAction, type QuickPaymentQrResult } from "@/app/actions";
import { SharePaymentQrButton } from "./SharePaymentQrButton";

const DEBOUNCE_MS = 400;
const DEFAULT_AMOUNT_CZK = "150";

export function QuickPaymentQr() {
  const t = useTranslations("quickPayment");
  const [amount, setAmount] = useState(DEFAULT_AMOUNT_CZK);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<QuickPaymentQrResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const value = Number(amount);
    if (!amount || !Number.isFinite(value) || value <= 0) {
      setResult(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        setResult(await generateQuickPaymentQrAction(value));
      });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [amount]);

  return (
    <div className="card mx-auto flex max-w-sm flex-col items-center gap-3 text-center">
      <h2 className="text-lg font-medium text-[var(--ink)]">{t("title")}</h2>
      <p className="text-sm text-[var(--muted)]">{t("hint")}</p>
      <label className="flex flex-col text-xs text-[var(--muted)]">
        {t("amountLabel")}
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t("amountPlaceholder")}
          className="input mt-1 w-40 text-center"
        />
      </label>

      {pending && <p className="text-sm text-[var(--muted)]">{t("generating")}</p>}

      {!pending && result && !result.ok && (
        <p className="text-sm text-[var(--danger)]">{t(`errors.${result.error}` as "errors.invalid_amount")}</p>
      )}

      {!pending && result && result.ok && (
        <>
          <Image src={result.qr} alt="QR" width={220} height={220} unoptimized />
          <SharePaymentQrButton qr={result.qr} spd={result.spd} title={t("title")} />
        </>
      )}
    </div>
  );
}
