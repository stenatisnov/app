import { useState } from "react";
import { useTranslations } from "@/i18n/i18n.client";

/**
 * Shares the QR code as an image — that's what a banking app's "pay by
 * photo/QR" import actually wants, unlike the raw SPD text. Falls back to
 * sharing the SPD text if the platform's Web Share API doesn't support
 * file attachments (`navigator.canShare({ files })` is false on most
 * desktop browsers even when `navigator.share` itself exists), and finally
 * to a plain clipboard copy of the SPD text if the Web Share API isn't
 * available at all.
 */
export function SharePaymentQrButton({ qr, spd, title }: { qr: string; spd: string; title: string }) {
  const t = useTranslations("common");
  const tBuy = useTranslations("buy");
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      const file = new File([await (await fetch(qr)).blob()], "qr-platba.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title, files: [file] });
        return;
      }
    } catch {
      // user cancelled the share sheet, or the file couldn't be shared — fall through
    }

    if (navigator.share) {
      try {
        await navigator.share({ title, text: spd });
        return;
      } catch {
        // user cancelled — fall through to clipboard copy
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
      {copied ? t("copied") : tBuy("shareQr")}
    </button>
  );
}
