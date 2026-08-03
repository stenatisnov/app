"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { adminDeleteGuestPassAction, adminSendGuestPassEmailAction } from "@/app/actions";
import { formatAppDateTime } from "@/lib/time";
import { guestPassUrl } from "@/lib/app-url";

export type GuestPassRow = {
  id: string;
  token: string;
  label: string | null;
  maxUses: number;
  usedCount: number;
  validFrom: string;
  validTo: string;
};

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
  const t = useTranslations("admin.guests");
  const tCommon = useTranslations("common");
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const link = guestPassUrl(pass.token);

  function handleDelete() {
    if (!window.confirm(t("deleteConfirm", { label: pass.label || pass.token.slice(0, 8) }))) return;
    startTransition(() => adminDeleteGuestPassAction(pass.id));
  }

  function handleSendEmail() {
    if (!email) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("passId", pass.id);
      formData.set("email", email);
      const result = await adminSendGuestPassEmailAction(formData);
      setEmailSent(Boolean(result?.ok));
    });
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(link);
  }

  return (
    <div className="card">
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
        {t("usedCount")}: {pass.usedCount}/{pass.maxUses} · {formatAppDateTime(new Date(pass.validFrom))} →{" "}
        {formatAppDateTime(new Date(pass.validTo))}
      </p>

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
          {t("sendEmailSubmit")}
        </button>
      </div>
      {emailSent && <p className="mt-1 text-xs text-[var(--ok)]">{t("emailSent")}</p>}
    </div>
  );
}
