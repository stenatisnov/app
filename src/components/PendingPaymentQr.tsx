import { useRef } from "react";
import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/translations";
import type { regeneratePaymentQrAction } from "@/lib/actions/payments";
import { SharePaymentQrButton } from "./SharePaymentQrButton";

/**
 * "QR kód" button next to a pending payment in the account page's "Neuhrazené
 * platby" list — re-renders that order's QR on demand (via
 * regeneratePaymentQrAction) for a member who closed/lost the original one
 * from checkout, without creating a second order.
 */
export function PendingPaymentQr({
  orderId,
  amountCzk,
  variableSymbol,
}: {
  orderId: string;
  amountCzk: number;
  variableSymbol: string | null;
}) {
  const t = useTranslations("account");
  const tBuy = useTranslations("buy");
  const tCommon = useTranslations("common");
  const fetcher = useFetcher<typeof regeneratePaymentQrAction>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pending = fetcher.state !== "idle";
  const result = fetcher.data ?? null;

  function open() {
    dialogRef.current?.showModal();
    const fd = new FormData();
    fd.set("intent", "regeneratePaymentQr");
    fd.set("orderId", orderId);
    fetcher.submit(fd, { method: "post" });
  }

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button type="button" className="btn btn-secondary !px-2 !py-1 text-xs" onClick={open}>
        {t("pendingPayments.showQr")}
      </button>
      <dialog
        ref={dialogRef}
        className="confirm-dialog"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <h2 className="text-lg font-semibold text-[var(--ink)]">{tBuy("qrTitle")}</h2>

          {pending && !result && <p className="text-sm text-[var(--muted)]">…</p>}

          {result && !result.ok && (
            <p className="text-sm text-[var(--danger)]">
              {t(`pendingPayments.errors.${result.error}` as "pendingPayments.errors.not_found")}
            </p>
          )}

          {result && result.ok && (
            <>
              <img src={result.qr} alt="QR" width={220} height={220} />
              <p className="text-[var(--ink)]">{tBuy("qrAmount", { amount: amountCzk })}</p>
              {variableSymbol && <p className="text-sm text-[var(--muted)]">{tBuy("qrVs", { vs: variableSymbol })}</p>}
              <p className="text-xs text-[var(--muted)]">{tBuy("qrNote")}</p>
              <SharePaymentQrButton qr={result.qr} spd={result.spd} title={tBuy("qrTitle")} />
            </>
          )}

          <button type="button" className="btn btn-primary" onClick={close}>
            {tCommon("close")}
          </button>
        </div>
      </dialog>
    </>
  );
}
