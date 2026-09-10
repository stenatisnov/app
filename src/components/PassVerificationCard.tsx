import { useEffect, useRef, useState } from "react";
import { useFetcher, useParams } from "react-router";
import jsQR from "jsqr";
import { useTranslations } from "@/i18n/translations";
import { defaultLocale, isLocale } from "@/i18n/routing";
import type {
  staffConfirmEntryAction,
  staffConfirmGuestEntryAction,
  staffLookupGuestForEntryAction,
  staffLookupUserForEntryAction,
  StaffEntryLookup,
  StaffGuestEntryLookup,
} from "@/lib/actions/staff";
import { formatAppDate } from "@/lib/time";
import { StatusBanner } from "./StatusBanner";

type ConfirmMemberResult = Awaited<ReturnType<typeof staffConfirmEntryAction>>;
type ConfirmGuestResult = Awaited<ReturnType<typeof staffConfirmGuestEntryAction>>;
type ConfirmResult = ConfirmMemberResult | ConfirmGuestResult;
type FoundMember = Extract<StaffEntryLookup, { ok: true }>;
type FoundGuest = Extract<StaffGuestEntryLookup, { ok: true }>;
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
  const [notFoundKind, setNotFoundKind] = useState<"member" | "guest" | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [confirmKind, setConfirmKind] = useState<"member" | "guest" | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);
  const [selectedDependentIds, setSelectedDependentIds] = useState<string[]>([]);
  // "" is a real, transient state (the field mid-edit, cleared before typing
  // a new digit) — clamping straight to 1 on every keystroke would snap the
  // input back to "1" the instant it's cleared, making it impossible to
  // select-all-and-retype. Only clamped to a real number on blur/submit.
  const [quantity, setQuantity] = useState<number | "">(1);
  const [dependentQuantities, setDependentQuantities] = useState<Record<string, number | "">>({});

  const lookupFetcher = useFetcher<typeof staffLookupUserForEntryAction | typeof staffLookupGuestForEntryAction>();
  const confirmFetcher = useFetcher<typeof staffConfirmEntryAction | typeof staffConfirmGuestEntryAction>();
  const pending = lookupFetcher.state !== "idle" || confirmFetcher.state !== "idle";
  const lookupKindRef = useRef<"member" | "guest" | null>(null);
  const scannedDependentIdsRef = useRef<string[]>([]);

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

  /** Parses a quantity `<input>`'s raw text as the user types — "" is passed through so the field can be cleared, everything else is truncated to a whole number and capped at `max` (the credits available to deduct from). */
  function parseQuantityInput(raw: string, max: number): number | "" {
    if (raw === "") return "";
    const n = Math.trunc(Number(raw));
    return Number.isFinite(n) && n > 0 ? clampQuantity(n, max) : "";
  }

  /** Coerces a possibly-empty quantity to the real value that'll be submitted — used on blur and at confirm time. */
  function resolveQuantity(value: number | "", max: number): number {
    return clampQuantity(Math.trunc(Number(value)) || 1, max);
  }

  function setDependentQuantity(id: string, raw: string, max: number) {
    setDependentQuantities((prev) => ({ ...prev, [id]: parseQuantityInput(raw, max) }));
  }

  function adjustQuantity(delta: number, max: number) {
    setQuantity((q) => clampQuantity(resolveQuantity(q, max) + delta, max));
  }

  function adjustDependentQuantity(id: string, delta: number, max: number) {
    setDependentQuantities((prev) => ({
      ...prev,
      [id]: clampQuantity(resolveQuantity(prev[id] ?? 1, max) + delta, max),
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
        const scannedDependentIds = scannedDependentIdsRef.current;
        if (scannedDependentIds.length > 0) {
          const availableIds = new Set(res.dependents.filter((dep) => dep.credits > 0).map((dep) => dep.id));
          setSelectedDependentIds(scannedDependentIds.filter((id) => availableIds.has(id)));
        }
      } else {
        setNotFoundKind("member");
      }
    } else {
      const res = lookupFetcher.data as StaffGuestEntryLookup;
      if (res.ok) setIdentity({ kind: "guest", data: res });
      else setNotFoundKind("guest");
    }
  }, [lookupFetcher.data]);

  useEffect(() => {
    if (confirmFetcher.data) setConfirmResult(confirmFetcher.data);
  }, [confirmFetcher.data]);

  function lookupIdentity(target: string) {
    setNotFoundKind(null);
    setIdentity(null);
    setConfirmResult(null);
    setSelectedDependentIds([]);
    setQuantity(1);
    setDependentQuantities({});
    // The member's own "Prokázat se obsluze" QR encodes their email alone,
    // or "email|depId1,depId2" when they'd already picked companions on
    // their own screen — carrying that choice through means staff doesn't
    // have to re-select it. Manually typed input never contains "|", so
    // this is a no-op fallback for that path.
    const [rawTarget, depPart] = target.split("|");
    const scannedDependentIds = depPart ? depPart.split(",").filter(Boolean) : [];
    scannedDependentIdsRef.current = scannedDependentIds;
    const isEmail = rawTarget.includes("@");
    const fd = new FormData();
    if (isEmail) {
      lookupKindRef.current = "member";
      fd.set("intent", "lookupMember");
      fd.set("email", rawTarget);
    } else {
      lookupKindRef.current = "guest";
      fd.set("intent", "lookupGuest");
      fd.set("token", rawTarget);
    }
    lookupFetcher.submit(fd, { method: "post" });
  }

  async function startScan() {
    setCameraError(false);
    setNotFoundKind(null);
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
      fd.set("quantity", String(resolveQuantity(quantity, current.data.credits)));
      for (const id of selectedDependentIds) {
        const dep = current.data.dependents.find((d) => d.id === id);
        fd.append("dependentIds", id);
        fd.set(`depQty_${id}`, String(resolveQuantity(dependentQuantities[id] ?? 1, dep?.credits ?? 1)));
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
            {t(notFoundKind === "member" ? "notFoundMember" : "notFoundGuest")}
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
                <p className="text-xs text-[var(--muted)]">{t("confirmCreditsLeft", { count: identity.data.credits })}</p>
                <div className="mx-auto flex flex-col items-center gap-1">
                  <span className="text-xs text-[var(--muted)]">{t("confirmQuantityLabel")}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={t("confirmQuantityDecrease")}
                      disabled={resolveQuantity(quantity, identity.data.credits) <= 1}
                      className="btn btn-secondary !w-8 !p-0 text-base leading-none disabled:opacity-50"
                      onClick={() => adjustQuantity(-1, identity.data.credits)}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={identity.data.credits}
                      value={quantity}
                      onChange={(e) => setQuantity(parseQuantityInput(e.target.value, identity.data.credits))}
                      onBlur={() => setQuantity((q) => resolveQuantity(q, identity.data.credits))}
                      aria-label={t("confirmQuantityLabel")}
                      className="input !w-16 !py-1 text-center"
                    />
                    <button
                      type="button"
                      aria-label={t("confirmQuantityIncrease")}
                      disabled={resolveQuantity(quantity, identity.data.credits) >= identity.data.credits}
                      className="btn btn-secondary !w-8 !p-0 text-base leading-none disabled:opacity-50"
                      onClick={() => adjustQuantity(1, identity.data.credits)}
                    >
                      +
                    </button>
                  </div>
                </div>
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
                  const depQuantity = resolveQuantity(dependentQuantities[dep.id] ?? 1, dep.credits);
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
                        <input
                          type="number"
                          min={1}
                          max={dep.credits}
                          disabled={!selected}
                          value={dependentQuantities[dep.id] ?? 1}
                          onChange={(e) => setDependentQuantity(dep.id, e.target.value, dep.credits)}
                          onBlur={() =>
                            setDependentQuantities((prev) => ({
                              ...prev,
                              [dep.id]: resolveQuantity(prev[dep.id] ?? 1, dep.credits),
                            }))
                          }
                          aria-label={t("confirmQuantityLabel")}
                          className="input !w-14 !py-1 text-center disabled:opacity-50"
                        />
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
    </section>
  );
}
