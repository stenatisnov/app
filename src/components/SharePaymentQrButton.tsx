"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/** Uses the Web Share API when available, otherwise falls back to copying the SPD payload. */
export function SharePaymentQrButton({ spd, title }: { spd: string; title: string }) {
  const t = useTranslations("common");
  const tBuy = useTranslations("buy");
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: spd });
        return;
      } catch {
        // user cancelled the share sheet — fall through to clipboard copy
      }
    }
    await navigator.clipboard.writeText(spd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="btn btn-secondary !px-3 !py-1.5 text-sm"
    >
      {copied ? t("copied") : tBuy("sharePayment")}
    </button>
  );
}
