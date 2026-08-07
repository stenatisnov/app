"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { qrDataUrl } from "@/lib/qr";

/**
 * Shows an identifier (a member's email or a guest pass token) as a QR code
 * so STAFF can scan it at the "Ověřit permanentku" tool — the actual
 * credit/pass deduction happens there, not here.
 */
export function IdentityQrDialog({
  open,
  value,
  title,
  hint,
  closeLabel,
  onClose,
}: {
  open: boolean;
  value: string;
  title: string;
  hint: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [qr, setQr] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open || !value) return;
    let cancelled = false;
    qrDataUrl(value).then((url) => {
      if (!cancelled) setQr(url);
    });
    return () => {
      cancelled = true;
    };
  }, [open, value]);

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <h2 className="text-lg font-semibold text-[var(--ink)]">{title}</h2>
        <p className="text-sm text-[var(--muted)]">{hint}</p>
        {qr ? (
          <Image src={qr} alt="QR" width={220} height={220} unoptimized />
        ) : (
          <div style={{ width: 220, height: 220 }} aria-hidden />
        )}
        <code className="text-xs text-[var(--muted)]">{value}</code>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </dialog>
  );
}
