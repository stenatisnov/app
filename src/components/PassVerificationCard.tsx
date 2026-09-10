import { useEffect, useRef, useState } from "react";
import { useFetcher, useParams } from "react-router";
import jsQR from "jsqr";
import { useTranslations } from "@/i18n/translations";
import { defaultLocale, isLocale } from "@/i18n/routing";
import type {
  staffConfirmEntryAction,
  staffConfirmGuestEntryAction,
  staffLookupGuestOrGroupAction,
  staffLookupUserForEntryAction,
  StaffEntryLookup,
  StaffGuestOrGroupLookup,
} from "@/lib/actions/staff";
import { formatAppDate } from "@/lib/time";
import { StatusBanner } from "./StatusBanner";
import { ChildGroupEntryDialog } from "./ChildGroupEntryDialog";

type ConfirmMemberResult = Awaited<ReturnType<typeof staffConfirmEntryAction>>;
type ConfirmGuestResult = Awaited<ReturnType<typeof staffConfirmGuestEntryAction>>;
type ConfirmResult = ConfirmMemberResult | ConfirmGuestResult;
type FoundMember = Extract<StaffEntryLookup, { ok: true }>;
type FoundGuest = Extract<StaffGuestOrGroupLookup, { kind: "guest" }>["data"];
type FoundChildGroup = Extract<StaffGuestOrGroupLookup, { kind: "group" }>["data"];
type Identity = { kind: "member"; data: FoundMember } | { kind: "guest"; data: FoundGuest };

/**
 * STAFF-side counterpart to both the member's "Prokázat se obsluze" QR and
 * the guest pass's own — looks the identifier up (typed, or scanned from a
 * QR via the phone camera), by email for a member or by pass code/token for
 * a guest, and only deducts an entry after an explicit confirm. A bare "@"
 * check decides which lookup to try; the lookup itself never touches
 * credits or the pass's use count.
 */
export function PassVerificationCard() {
  const t = useTranslations("paymentCheck");
  const tDash = useTranslations("dashboard");
  const tGuest = useTranslations("guest");
  const { locale: paramLocale } = useParams();
  const locale = isLocale(paramLocale) ? paramLocale : defaultLocale;
  const dateLocale = locale === "en" ? "en-GB" : "cs-CZ";

  const [value, setValue] = useState("");
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [notFoundKind, setNotFoundKind] = useState<"member" | "guestOrGroup" | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [childGroupData, setChildGroupData] = useState<FoundChildGroup | null>(null);
  const [confirmKind, setConfirmKind] = useState<"member" | "guest" | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);
  const [selectedDependentIds, setSelectedDependentIds] = useState<string[]>([]);
  // Adjustable only via the +/- buttons below (never a typed-in number) so
  // tapping the quantity doesn't pop the on-screen keyboard on mobile —
  // always a valid clamped number, never a transient "" mid-edit state.
  const [quantity, setQuantity] = useState(1);
  const [dependentQuantities, setDependentQuantities] = useState<Record<string, number>>({});
  // Same "escorting only, not entering themselves" choice as the member's
  // own dashboard — checked by default, but always uncheckable regardless
  // of credits (see openGateForUser's includeSelf). Carried over from the
  // member's own QR when they'd already made that choice on their screen.
  const [includeSelf, setIncludeSelf] = useState(true);

  const lookupFetcher = useFetcher<typeof staffLookupUserForEntryAction | typeof staffLookupGuestOrGroupAction>();
  const confirmFetcher = useFetcher<typeof staffConfirmEntryAction | typeof staffConfirmGuestEntryAction>();
  const pending = lookupFetcher.state !== "idle" || confirmFetcher.state !== "idle";
  const lookupKindRef = useRef<"member" | "guestOrGroup" | null>(null);
  const scannedDependentIdsRef = useRef<string[]>([]);
  const scannedIncludeSelfRef = useRef(true);

  // A companion with 0 credits has nothing to deduct, so it can't be
  // selected for entry at all (rather than being selectable and then
  // failing at confirm time).
  function toggleDependent(id: string, credits: number) {
    if (credits <= 0) return;
    setSelectedDependentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  /** Clamps a quantity to [1, max] — never below 1, never above the remaining credits it'd deduct from. */
  function clampQuantity(n: number, max: number): number {
    return Math.min(Math.max(1, n), Math.max(1, max));
  }

  function adjustQuantity(delta: number, max: number) {
    setQuantity((q) => clampQuantity(q + delta, max));
  }

  function adjustDependentQuantity(id: string, delta: number, max: number) {
    setDependentQuantities((prev) => ({
      ...prev,
      [id]: clampQuantity((prev[id] ?? 1) + delta, max),
    }));
  }

  const videoRef = useRef<HTMLVideoElement>(null);
  const scanDialogRef = useRef<HTMLDialogElement>(null);
  const confirmDialogRef = useRef<HTMLDialogElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const dialog = scanDialogRef.current;
    if (!dialog) return;
    if (scanning && !dialog.open) dialog.showModal();
    if (!scanning && dialog.open) dialog.close();
  }, [scanning]);

  useEffect(() => {
    const dialog = confirmDialogRef.current;
    if (!dialog) return;
    if (identity && !dialog.open) dialog.showModal();
    if (!identity && dialog.open) dialog.close();
  }, [identity]);

  function stopScan() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }

  useEffect(() => stopScan, []);

  useEffect(() => {
    if (!lookupFetcher.data || lookupKindRef.current === null) return;
    if (lookupKindRef.current === "member") {
      const res = lookupFetcher.data as StaffEntryLookup;
      if (res.ok) {
        setIdentity({ kind: "member", data: res });
        setIncludeSelf(scannedIncludeSelfRef.current);
        const scannedDependentIds = scannedDependentIdsRef.current;
        if (scannedDependentIds.length > 0) {
          const availableIds = new Set(res.dependents.filter((dep) => dep.credits > 0).map((dep) => dep.id));
          setSelectedDependentIds(scannedDependentIds.filter((id) => availableIds.has(id)));
        }
      } else {
        setNotFoundKind("member");
      }
    } else {
      const res = lookupFetcher.data as StaffGuestOrGroupLookup;
      if (res.kind === "guest") setIdentity({ kind: "guest", data: res.data });
      else if (res.kind === "group") setChildGroupData(res.data);
      else setNotFoundKind("guestOrGroup");
    }
  }, [lookupFetcher.data]);

  useEffect(() => {
    if (confirmFetcher.data) setConfirmResult(confirmFetcher.data);
  }, [confirmFetcher.data]);

  function lookupIdentity(target: string) {
    setNotFoundKind(null);
    setIdentity(null);
    setChildGroupData(null);
    setConfirmResult(null);
    setSelectedDependentIds([]);
    setQuantity(1);
    setDependentQuantities({});
    setIncludeSelf(true);
    // The member's own "Prokázat se obsluze" QR encodes
    // "email|includeSelf(1/0)|depId1,depId2" — carrying their own
    // who's-entering choice through means staff doesn't have to re-select
    // it. Manually typed input never contains "|", so `rawTarget` is just
    // the whole typed value and the other two parts stay undefined/unset.
    const [rawTarget, includeSelfPart, depPart] = target.split("|");
    scannedIncludeSelfRef.current = includeSelfPart !== "0";
    const scannedDependentIds = depPart ? depPart.split(",").filter(Boolean) : [];
    scannedDependentIdsRef.current = scannedDependentIds;
    const isEmail = rawTarget.includes("@");
    const fd = new FormData();
    if (isEmail) {
      lookupKindRef.current = "member";
      fd.set("intent", "lookupMember");
      fd.set("email", rawTarget);
    } else {
      // Non-email input might be a guest-pass token or a child-group name —
      // the server tries both and reports which one it resolved to.
      lookupKindRef.current = "guestOrGroup";
      fd.set("intent", "lookupGuestOrGroup");
      fd.set("value", rawTarget);
    }
    lookupFetcher.submit(fd, { method: "post" });
  }

  async function startScan() {
    setCameraError(false);
    setNotFoundKind(null);
    setChildGroupData(null);
    setConfirmResult(null);
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const tick = () => {
        if (video && ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code?.data) {
            const scanned = code.data.trim();
            stopScan();
            setValue(scanned.split("|")[0]);
            lookupIdentity(scanned);
            return;
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setCameraError(true);
      setScanning(false);
    }
  }

  function handleVerifyClick() {
    const target = value.trim();
    if (target === "") {
      startScan();
    } else {
      lookupIdentity(target);
    }
  }

  function handleConfirm() {
    if (!identity) return;
    const current = identity;
    const fd = new FormData();
    if (current.kind === "member") {
      fd.set("intent", "confirmMemberEntry");
      fd.set("userId", current.data.userId);
      fd.set("quantity", String(quantity));
      fd.set("includeSelf", String(includeSelf));
      for (const id of selectedDependentIds) {
        fd.append("dependentIds", id);
        fd.set(`depQty_${id}`, String(dependentQuantities[id] ?? 1));
      }
    } else {
      fd.set("intent", "confirmGuestEntry");
      fd.set("token", current.data.token);
    }
    confirmFetcher.submit(fd, { method: "post" });
    setConfirmKind(current.kind);
    setIdentity(null);
    setValue("");
    setSelectedDependentIds([]);
    setQuantity(1);
    setDependentQuantities({});
    setIncludeSelf(true);
  }

  return (
    <section className="card">
      <h2 className="text-lg font-medium text-[var(--ink)]">{t("verifyTitle")}</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">{t("verifyHint")}</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("verifyEmailLabel")}
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="input"
            placeholder="jan@example.com"
          />
        </label>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={handleVerifyClick}>
          {t("verifyButton")}
        </button>
      </div>

      {cameraError && (
        <div className="mt-2">
          <StatusBanner tone="danger">{t("cameraError")}</StatusBanner>
        </div>
      )}
      {notFoundKind && (
        <div className="mt-2">
          <StatusBanner tone="danger">
            {t(notFoundKind === "member" ? "notFoundMember" : "notFoundGuestOrGroup")}
          </StatusBanner>
        </div>
      )}
      {confirmResult && !confirmResult.ok && (
        <div className="mt-2">
          <StatusBanner tone="danger">
            {confirmKind === "guest"
              ? tGuest.has(`errors.${confirmResult.code}`)
                ? tGuest(`errors.${confirmResult.code}` as Parameters<typeof tGuest>[0])
                : confirmResult.message
              : confirmResult.code === "NO_CREDITS_DEPENDENT" && confirmResult.dependentName
                ? tDash("errors.NO_CREDITS_DEPENDENT", { name: confirmResult.dependentName })
                : tDash.has(`errors.${confirmResult.code}`)
                  ? tDash(`errors.${confirmResult.code}` as Parameters<typeof tDash>[0])
                  : confirmResult.message}
          </StatusBanner>
        </div>
      )}
      {confirmResult && confirmResult.ok && (
        <div className="mt-2">
          <StatusBanner tone="info">{t("entrySuccess")}</StatusBanner>
        </div>
      )}

      <dialog
        ref={scanDialogRef}
        className="confirm-dialog"
        onCancel={(e) => {
          e.preventDefault();
          stopScan();
        }}
        onClick={(e) => {
          if (e.target === scanDialogRef.current) stopScan();
        }}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <h3 className="text-base font-semibold text-[var(--ink)]">{t("scanTitle")}</h3>
          <p className="text-xs text-[var(--muted)]">{t("scanHint")}</p>
          <video ref={videoRef} className="w-full max-w-xs rounded-lg" muted playsInline />
          <button type="button" className="btn btn-secondary" onClick={stopScan}>
            {t("scanCancel")}
          </button>
        </div>
      </dialog>

      <dialog
        ref={confirmDialogRef}
        className="confirm-dialog"
        onCancel={(e) => {
          e.preventDefault();
          setIdentity(null);
        }}
        onClick={(e) => {
          if (e.target === confirmDialogRef.current) setIdentity(null);
        }}
      >
        {identity?.kind === "member" && (
          <div className="flex flex-col gap-3 text-center">
            <h3 className="text-base font-semibold text-[var(--ink)]">{t("confirmTitle")}</h3>
            <p className="text-sm text-[var(--ink)]">{identity.data.name || identity.data.email}</p>
            {identity.data.unlimitedAccess ? (
              <p className="text-xs text-[var(--muted)]">{t("confirmUnlimited")}</p>
            ) : identity.data.hasActivePass ? (
              <p className="text-xs text-[var(--muted)]">
                {t("confirmActivePass", {
                  date: identity.data.activePassUntil ? formatAppDate(identity.data.activePassUntil, dateLocale) : "",
                })}
              </p>
            ) : (
              <>
                <label className="mx-auto flex items-center gap-2 text-sm text-[var(--ink)]">
                  <input type="checkbox" checked={includeSelf} onChange={(e) => setIncludeSelf(e.target.checked)} />
                  {t("confirmSelfEntering")}
                </label>
                <p className="text-xs text-[var(--muted)]">{t("confirmCreditsLeft", { count: identity.data.credits })}</p>
                {includeSelf && (
                  <div className="mx-auto flex flex-col items-center gap-1">
                    <span className="text-xs text-[var(--muted)]">{t("confirmQuantityLabel")}</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={t("confirmQuantityDecrease")}
                        disabled={quantity <= 1}
                        className="btn btn-secondary !w-8 !p-0 text-base leading-none disabled:opacity-50"
                        onClick={() => adjustQuantity(-1, identity.data.credits)}
                      >
                        −
                      </button>
                      <span
                        role="status"
                        aria-live="polite"
                        aria-label={t("confirmQuantityLabel")}
                        className="input !w-16 !py-1 select-none text-center"
                      >
                        {quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={t("confirmQuantityIncrease")}
                        disabled={quantity >= identity.data.credits}
                        className="btn btn-secondary !w-8 !p-0 text-base leading-none disabled:opacity-50"
                        onClick={() => adjustQuantity(1, identity.data.credits)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            {!identity.data.canEnter && identity.data.blockedReason && (
              <StatusBanner tone="danger">
                {tDash(`errors.${identity.data.blockedReason}` as Parameters<typeof tDash>[0])}
              </StatusBanner>
            )}
            {identity.data.dependents.length > 0 && (
              <fieldset className="flex flex-col gap-1.5 rounded-lg border border-[var(--line)] px-3 py-2.5 text-left text-sm">
                <legend className="px-1 text-xs font-medium text-[var(--muted)]">{tDash("dependentsLegend")}</legend>
                {identity.data.dependents.map((dep) => {
                  const selected = selectedDependentIds.includes(dep.id);
                  const noCredits = dep.credits <= 0;
                  const depQuantity = dependentQuantities[dep.id] ?? 1;
                  return (
                    <div key={dep.id} className={`flex items-center justify-between gap-2 ${noCredits ? "opacity-50" : ""}`}>
                      <label className="flex items-center gap-2 text-[var(--ink)]">
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={noCredits}
                          onChange={() => toggleDependent(dep.id, dep.credits)}
                        />
                        {dep.name} ({tDash("creditsLabel")}: {dep.credits})
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={t("confirmQuantityDecrease")}
                          disabled={!selected || depQuantity <= 1}
                          className="btn btn-secondary !w-7 !p-0 text-sm leading-none disabled:opacity-50"
                          onClick={() => adjustDependentQuantity(dep.id, -1, dep.credits)}
                        >
                          −
                        </button>
                        <span
                          role="status"
                          aria-live="polite"
                          aria-label={t("confirmQuantityLabel")}
                          aria-disabled={!selected}
                          className={`input !w-14 !py-1 select-none text-center ${!selected ? "opacity-50" : ""}`}
                        >
                          {depQuantity}
                        </span>
                        <button
                          type="button"
                          aria-label={t("confirmQuantityIncrease")}
                          disabled={!selected || depQuantity >= dep.credits}
                          className="btn btn-secondary !w-7 !p-0 text-sm leading-none disabled:opacity-50"
                          onClick={() => adjustDependentQuantity(dep.id, 1, dep.credits)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </fieldset>
            )}
            {!includeSelf && selectedDependentIds.length === 0 && (
              <StatusBanner tone="danger">{t("nothingSelectedHint")}</StatusBanner>
            )}
            <div className="flex justify-center gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending || (!includeSelf && selectedDependentIds.length === 0)}
                onClick={handleConfirm}
              >
                {t("confirmConfirm")}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setIdentity(null)}>
                {t("confirmCancel")}
              </button>
            </div>
          </div>
        )}
        {identity?.kind === "guest" && (
          <div className="flex flex-col gap-3 text-center">
            <h3 className="text-base font-semibold text-[var(--ink)]">{t("confirmTitle")}</h3>
            <p className="text-sm text-[var(--ink)]">{identity.data.label || identity.data.token.slice(0, 8)}</p>
            <p className="text-xs text-[var(--muted)]">
              {t("confirmGuestRemaining", { count: identity.data.remaining })}
            </p>
            {!identity.data.canEnter && identity.data.blockedReason && (
              <StatusBanner tone="danger">
                {tGuest(`errors.${identity.data.blockedReason}` as Parameters<typeof tGuest>[0])}
              </StatusBanner>
            )}
            <div className="flex justify-center gap-2">
              <button type="button" className="btn btn-primary" disabled={pending} onClick={handleConfirm}>
                {t("confirmConfirm")}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setIdentity(null)}>
                {t("confirmCancel")}
              </button>
            </div>
          </div>
        )}
      </dialog>

      <ChildGroupEntryDialog group={childGroupData} onClose={() => setChildGroupData(null)} />
    </section>
  );
}
