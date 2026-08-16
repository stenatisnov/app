import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/translations";
import type { generateQuickPaymentQrAction } from "@/lib/actions/payments";
import { SharePaymentQrButton } from "./SharePaymentQrButton";

const DEBOUNCE_MS = 400;
const DEFAULT_AMOUNT_CZK = "150";

export function QuickPaymentQr() {
  const t = useTranslations("quickPayment");
  const [amount, setAmount] = useState(DEFAULT_AMOUNT_CZK);
  const fetcher = useFetcher<typeof generateQuickPaymentQrAction>();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const amountValue = Number(amount);
  const amountValid = Boolean(amount) && Number.isFinite(amountValue) && amountValue > 0;
  const pending = amountValid && fetcher.state !== "idle";
  const result = amountValid ? (fetcher.data ?? null) : null;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!amountValid) {
      return;
    }

    debounceRef.current = setTimeout(() => {
      const fd = new FormData();
      fd.set("intent", "generateQuickPaymentQr");
      fd.set("amountCzk", String(amountValue));
      fetcher.submit(fd, { method: "post" });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <img src={result.qr} alt="QR" width={220} height={220} />
          <SharePaymentQrButton qr={result.qr} spd={result.spd} title={t("title")} />
        </>
      )}
    </div>
  );
}
