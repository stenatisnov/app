import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { checkGateOnlineAction } from "@/lib/actions/gate";

/**
 * Just the "is the gate actually reachable, then really open it?" step —
 * split out of the old two-choice EntryOptionsDialog (still used as-is by
 * GuestOpenButton) since OpenGateButton's "Otevřít bránu" is now its own
 * always-visible section/button rather than one of two options inside a
 * shared picker dialog. Checks reachability itself as soon as it opens, so
 * the confirm button starts disabled and only enables once known online.
 */
export function OpenGateConfirmDialog({
  open,
  confirmMessage,
  checkingLabel,
  offlineHint,
  yesLabel,
  noLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  confirmMessage: string;
  checkingLabel: string;
  offlineHint: string;
  yesLabel: string;
  noLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const checkFetcher = useFetcher<typeof checkGateOnlineAction>();
  const [gateOnline, setGateOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setGateOnline(null);
      return;
    }
    const fd = new FormData();
    fd.set("intent", "checkGateOnline");
    checkFetcher.submit(fd, { method: "post" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (checkFetcher.data) setGateOnline(checkFetcher.data.online);
  }, [checkFetcher.data]);

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
        <p className="text-sm text-[var(--ink)]">{confirmMessage}</p>
        {gateOnline === null && <p className="text-xs text-[var(--muted)]">{checkingLabel}</p>}
        {gateOnline === false && <p className="text-xs text-[var(--danger)]">{offlineHint}</p>}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            className="btn btn-open w-full disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending || gateOnline !== true}
            onClick={onConfirm}
          >
            {yesLabel}
          </button>
          <button
            type="button"
            className="btn btn-secondary w-full disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending}
            onClick={onCancel}
          >
            {noLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
