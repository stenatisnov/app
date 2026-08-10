"use client";

import { useEffect, useRef, useState } from "react";
import { checkGateOnlineAction } from "@/app/actions";

/**
 * Confirmation dialog offering three ways to proceed: open the gate (only
 * once we've confirmed the controller agent is actually reachable), enter
 * without opening it, or cancel. Checks gate reachability itself as soon
 * as it opens, so the "open gate" option starts disabled and only enables
 * once we know it can actually work.
 */
export function EntryOptionsDialog({
  open,
  title,
  openGateLabel,
  openGateNote,
  enterOnlyLabel,
  enterOnlyNote,
  cancelLabel,
  checkingLabel,
  offlineHint,
  pending,
  showEnterOnly = true,
  onOpenGate,
  onEnterOnly,
  onCancel,
}: {
  open: boolean;
  title: string;
  openGateLabel: string;
  /** Shown under the open-gate button — this option is meant for outside opening hours. */
  openGateNote: string;
  enterOnlyLabel: string;
  /** Shown under the show-to-staff button — this option is meant for during opening hours. */
  enterOnlyNote: string;
  cancelLabel: string;
  checkingLabel: string;
  offlineHint: string;
  pending: boolean;
  /** STAFF/ADMIN/ROOT never need to skip opening the physical gate — hide the option entirely. */
  showEnterOnly?: boolean;
  onOpenGate: () => void;
  onEnterOnly: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
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
    let cancelled = false;
    checkGateOnlineAction().then((res) => {
      if (!cancelled) setGateOnline(res.online);
    });
    return () => {
      cancelled = true;
    };
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
        <div className="flex flex-col gap-3">
          {showEnterOnly && (
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                className="btn btn-secondary w-full disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pending}
                onClick={onEnterOnly}
              >
                {enterOnlyLabel}
              </button>
              <p className="text-xs text-[var(--muted)]">{enterOnlyNote}</p>
            </div>
          )}

          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              className="btn btn-secondary w-full disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pending || gateOnline !== true}
              onClick={onOpenGate}
            >
              {openGateLabel}
            </button>
            <p className="text-xs text-[var(--muted)]">{openGateNote}</p>
            {gateOnline === null && <p className="text-xs text-[var(--muted)]">{checkingLabel}</p>}
            {gateOnline === false && <p className="text-xs text-[var(--danger)]">{offlineHint}</p>}
          </div>

          <button
            type="button"
            className="btn btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
