"use client";

import { useEffect, useRef } from "react";

/**
 * A styled `<dialog>` instead of `window.confirm()` — same modal semantics
 * (focus trap, Esc to close, inert background) but themed to match the rest
 * of the app instead of the browser's own alert chrome. Controlled by
 * `open`; the caller owns the state and decides what happens on confirm.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel();
      }}
    >
      <div className="flex flex-col gap-4 text-center">
        <h2 className="text-lg font-semibold text-[var(--ink)]">{title}</h2>
        <p className="text-sm text-[var(--muted)]">{message}</p>
        <div className="flex justify-center gap-3">
          <button type="button" className="btn btn-secondary flex-1" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn btn-primary flex-1" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
