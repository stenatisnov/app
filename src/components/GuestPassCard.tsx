import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/translations";
import type { adminDeleteGuestPassAction, adminSendGuestPassEmailAction } from "@/lib/actions/admin-guests";
import { formatAppDate } from "@/lib/time";
import { guestPassPath, guestPassUrl } from "@/lib/app-url";
import { qrDataUrl } from "@/lib/qr";

export type GuestPassRow = {
  id: string;
  token: string;
  label: string | null;
  maxUses: number;
  usedCount: number;
  validFrom: string;
  validTo: string;
};

export type GuestPassStatus = "valid" | "expired";

export function guestPassStatus(pass: GuestPassRow, now = new Date()): GuestPassStatus {
  if (pass.usedCount >= pass.maxUses) return "expired";
  if (now > new Date(pass.validTo)) return "expired";
  return "valid";
}

const inputClass = "input !py-1 text-sm";
const buttonClass = "btn btn-secondary !px-2 !py-1 text-xs";

export function GuestPassCard({
  pass,
  selected,
  onToggleSelect,
}: {
  pass: GuestPassRow;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const deleteFetcher = useFetcher<typeof adminDeleteGuestPassAction>();
  const emailFetcher = useFetcher<typeof adminSendGuestPassEmailAction>();
  const pending = deleteFetcher.state !== "idle" || emailFetcher.state !== "idle";
  const [qr, setQr] = useState("");
  const [enlarged, setEnlarged] = useState(false);

  // Start from the env/SSR fallback, then switch to the real browser origin once
  // mounted so the shown/copied link matches the address the admin is actually on.
  const [link, setLink] = useState(() => guestPassUrl(pass.token));
  useEffect(() => {
    setLink(window.location.origin + guestPassPath(pass.token));
  }, [pass.token]);
  useEffect(() => {
    qrDataUrl(link).then(setQr).catch(() => {});
  }, [link]);

  useEffect(() => {
    if (emailFetcher.data) setEmailSent(Boolean(emailFetcher.data.ok));
  }, [emailFetcher.data]);

  const status = guestPassStatus(pass);
  const from = formatAppDate(new Date(pass.validFrom));
  const to = formatAppDate(new Date(pass.validTo));

  function handleDelete() {
    if (!window.confirm(t("guests.deleteConfirm", { label: pass.label || pass.token.slice(0, 8) }))) return;
    const fd = new FormData();
    fd.set("intent", "deleteGuestPass");
    fd.set("passId", pass.id);
    deleteFetcher.submit(fd, { method: "post" });
  }

  function handleSendEmail() {
    if (!email) return;
    const fd = new FormData();
    fd.set("intent", "sendGuestPassEmail");
    fd.set("passId", pass.id);
    fd.set("email", email);
    emailFetcher.submit(fd, { method: "post" });
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(link);
  }

  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => qr && setEnlarged(true)}
          className="shrink-0 overflow-hidden rounded border border-[var(--line)]"
          aria-label={t("guests.enlargeQr")}
        >
          {qr ? (
            <img src={qr} alt="QR" width={64} height={64} />
          ) : (
            <div style={{ width: 64, height: 64 }} aria-hidden />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={selected} onChange={() => onToggleSelect(pass.id)} />
              <span className="font-medium text-[var(--ink)]">{pass.label || pass.token.slice(0, 8)}</span>
            </label>
            <button type="button" onClick={handleDelete} disabled={pending} className="text-xs text-[var(--danger)]">
              {tCommon("delete")}
            </button>
          </div>

          <p className="mt-1 text-xs text-[var(--muted)]">
            <span className={status === "valid" ? "text-[var(--ok)]" : "text-[var(--danger)]"}>
              {t(status === "valid" ? "guests.statusValid" : "guests.statusExpired")}
            </span>
            {" · "}
            {t("guests.usedCount")}: {pass.usedCount}/{pass.maxUses} · {from === to ? from : `${from} → ${to}`}
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input readOnly value={link} className={`${inputClass} flex-1`} />
        <button type="button" onClick={handleCopy} className={buttonClass}>
          {tCommon("copyLink")}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          type="email"
          placeholder={tCommon("email")}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailSent(false);
          }}
          className={`${inputClass} flex-1`}
        />
        <button type="button" onClick={handleSendEmail} disabled={pending} className={buttonClass}>
          {t("guests.sendEmailSubmit")}
        </button>
      </div>
      {emailSent && <p className="mt-1 text-xs text-[var(--ok)]">{t("guests.emailSent")}</p>}

      {enlarged && qr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setEnlarged(false)}
        >
          <div className="flex flex-col items-center gap-3 rounded-lg bg-[var(--bg)] p-6" onClick={(e) => e.stopPropagation()}>
            <img src={qr} alt="QR" width={280} height={280} />
            <p className="text-sm font-medium text-[var(--ink)]">{pass.label || pass.token.slice(0, 8)}</p>
            <button type="button" onClick={() => setEnlarged(false)} className={buttonClass}>
              {tCommon("close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
