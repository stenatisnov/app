"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import jsQR from "jsqr";
import { staffConfirmEntryAction, staffLookupUserForEntryAction, type StaffEntryLookup } from "@/app/actions";
import { formatAppDate } from "@/lib/time";
import { StatusBanner } from "./StatusBanner";

type ConfirmResult = Awaited<ReturnType<typeof staffConfirmEntryAction>>;
type FoundLookup = Extract<StaffEntryLookup, { ok: true }>;

/**
 * STAFF-side counterpart to the member's "Prokázat se obsluze" QR: looks the
 * member up by email (typed, or scanned from their QR via the phone camera)
 * and only deducts an entry after an explicit confirm — the lookup itself
 * never touches credits.
 */
export function PassVerificationCard() {
  const t = useTranslations("paymentCheck");
  const tDash = useTranslations("dashboard");
  const locale = useLocale();
  const dateLocale = locale === "en" ? "en-GB" : "cs-CZ";

  const [email, setEmail] = useState("");
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [lookup, setLookup] = useState<FoundLookup | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);
  const [pending, startTransition] = useTransition();

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
    if (lookup && !dialog.open) dialog.showModal();
    if (!lookup && dialog.open) dialog.close();
  }, [lookup]);

  function stopScan() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }

  useEffect(() => stopScan, []);

  function lookupUser(targetEmail: string) {
    setNotFound(false);
    setLookup(null);
    setConfirmResult(null);
    startTransition(async () => {
      const res = await staffLookupUserForEntryAction(targetEmail);
      if (res.ok) setLookup(res);
      else setNotFound(true);
    });
  }

  async function startScan() {
    setCameraError(false);
    setNotFound(false);
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
            setEmail(scanned);
            lookupUser(scanned);
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
    if (email.trim() === "") {
      startScan();
    } else {
      lookupUser(email);
    }
  }

  function handleConfirm() {
    if (!lookup) return;
    startTransition(async () => {
      const res = await staffConfirmEntryAction(lookup.userId);
      setConfirmResult(res);
      setLookup(null);
      if (res.ok) setEmail("");
    });
  }

  return (
    <section className="card">
      <h2 className="text-lg font-medium text-[var(--ink)]">{t("verifyTitle")}</h2>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("verifyEmailLabel")}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
      {notFound && (
        <div className="mt-2">
          <StatusBanner tone="danger">{t("notFound")}</StatusBanner>
        </div>
      )}
      {confirmResult && !confirmResult.ok && (
        <div className="mt-2">
          <StatusBanner tone="danger">
            {tDash.has(`errors.${confirmResult.code}`)
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
          setLookup(null);
        }}
        onClick={(e) => {
          if (e.target === confirmDialogRef.current) setLookup(null);
        }}
      >
        {lookup && (
          <div className="flex flex-col gap-3 text-center">
            <h3 className="text-base font-semibold text-[var(--ink)]">{t("confirmTitle")}</h3>
            <p className="text-sm text-[var(--ink)]">{lookup.name || lookup.email}</p>
            {lookup.unlimitedAccess ? (
              <p className="text-xs text-[var(--muted)]">{t("confirmUnlimited")}</p>
            ) : lookup.hasActivePass ? (
              <p className="text-xs text-[var(--muted)]">
                {t("confirmActivePass", {
                  date: lookup.activePassUntil ? formatAppDate(lookup.activePassUntil, dateLocale) : "",
                })}
              </p>
            ) : (
              <p className="text-xs text-[var(--muted)]">{t("confirmCreditsLeft", { count: lookup.credits })}</p>
            )}
            {!lookup.canEnter && lookup.blockedReason && (
              <StatusBanner tone="danger">
                {tDash(`errors.${lookup.blockedReason}` as Parameters<typeof tDash>[0])}
              </StatusBanner>
            )}
            <div className="flex justify-center gap-2">
              <button type="button" className="btn btn-primary" disabled={pending} onClick={handleConfirm}>
                {t("confirmConfirm")}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setLookup(null)}>
                {t("confirmCancel")}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
