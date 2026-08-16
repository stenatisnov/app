import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/translations";
import type { checkGateOnlineAction } from "@/lib/actions/gate";

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
  openGateConfirmMessage,
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
  /** Shown in a Yes/No confirmation step before the gate actually opens. */
  openGateConfirmMessage: string;
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
  const t = useTranslations("common");
  const ref = useRef<HTMLDialogElement>(null);
  const checkFetcher = useFetcher<typeof checkGateOnlineAction>();
  const [gateOnline, setGateOnline] = useState<boolean | null>(null);
  const [confirmingOpenGate, setConfirmingOpenGate] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setGateOnline(null);
      setConfirmingOpenGate(false);
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
        {confirmingOpenGate ? (
          <>
            <p className="text-sm text-[var(--ink)]">{openGateConfirmMessage}</p>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                className="btn btn-open w-full disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pending}
                onClick={() => {
                  setConfirmingOpenGate(false);
                  onOpenGate();
                }}
              >
                {t("yes")}
              </button>
              <button
                type="button"
                className="btn btn-secondary w-full disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pending}
                onClick={() => setConfirmingOpenGate(false)}
              >
                {t("no")}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-[var(--ink)]">{title}</h2>
            <div className="flex flex-col gap-3">
              {showEnterOnly && (
                <button
                  type="button"
                  className="btn btn-secondary w-full flex-col disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={pending}
                  onClick={onEnterOnly}
                >
                  <span>{enterOnlyLabel}</span>
                  <span className="text-xs font-normal opacity-70">{enterOnlyNote}</span>
                </button>
              )}

              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  className="btn btn-secondary w-full flex-col disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={pending || gateOnline !== true}
                  onClick={() => setConfirmingOpenGate(true)}
                >
                  <span>{openGateLabel}</span>
                  <span className="text-xs font-normal opacity-70">{openGateNote}</span>
                </button>
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
          </>
        )}
      </div>
    </dialog>
  );
}
