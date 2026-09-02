import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { adminSendUnmatchedReceiptAction } from "@/lib/actions/admin-payments";

/**
 * Email-entry popup for "Poslat účtenku" on an unmatched Fio transfer
 * (Kontrola plateb → Platby převodem mimo aplikaci). Keyed by `auditLogId`
 * at the call site so each open gets a fresh `useFetcher` — no manual
 * reset needed between rows or repeat opens.
 */
export function SendReceiptDialog({
  open,
  auditLogId,
  title,
  emailLabel,
  submitLabel,
  sendingLabel,
  cancelLabel,
  closeLabel,
  successMessage,
  errorMessage,
  onClose,
}: {
  open: boolean;
  auditLogId: string;
  title: string;
  emailLabel: string;
  submitLabel: string;
  sendingLabel: string;
  cancelLabel: string;
  closeLabel: string;
  successMessage: (email: string) => string;
  errorMessage: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const fetcher = useFetcher<typeof adminSendUnmatchedReceiptAction>();
  const [email, setEmail] = useState("");
  const pending = fetcher.state !== "idle";
  const result = fetcher.data ?? null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("intent", "sendUnmatchedReceipt");
    fd.set("auditLogId", auditLogId);
    fd.set("email", email);
    fetcher.submit(fd, { method: "post" });
  }

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
      <div className="flex flex-col gap-4 text-center">
        <h2 className="text-lg font-semibold text-[var(--ink)]">{title}</h2>

        {result?.ok ? (
          <>
            <p className="text-sm text-[var(--ink)]">{successMessage(result.email)}</p>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              {closeLabel}
            </button>
          </>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-1 text-left text-sm text-[var(--muted)]">
              {emailLabel}
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                autoFocus
              />
            </label>
            {result && !result.ok && <p className="text-sm text-[var(--danger)]">{errorMessage}</p>}
            <div className="flex justify-center gap-3">
              <button type="button" className="btn btn-secondary flex-1" onClick={onClose} disabled={pending}>
                {cancelLabel}
              </button>
              <button type="submit" className="btn btn-primary flex-1" disabled={pending}>
                {pending ? sendingLabel : submitLabel}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
