"use client";

import { useRef, useTransition } from "react";
import { useTranslations } from "next-intl";
import { adminCreateGuestPassAction } from "@/app/actions";
import { toAppDateValue } from "@/lib/time";

const inputClass = "input !py-1.5 text-sm";
const primaryButtonClass = "btn btn-primary !px-3 !py-1.5 text-xs";

export function GuestCreateForm() {
  const t = useTranslations("admin.guests");
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const today = toAppDateValue();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await adminCreateGuestPassAction(formData);
      if (result?.ok) formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col text-xs text-[var(--muted)]">
        {t("label")}
        <input name="label" className={inputClass} />
      </label>
      <label className="flex flex-col text-xs text-[var(--muted)]">
        {t("maxUses")}
        <input name="maxUses" type="number" min={1} defaultValue={1} className={inputClass} />
      </label>
      <label className="flex flex-col text-xs text-[var(--muted)]">
        {t("validFrom")}
        <input name="validFrom" type="date" defaultValue={today} required className={inputClass} />
      </label>
      <label className="flex flex-col text-xs text-[var(--muted)]">
        {t("validTo")}
        <input name="validTo" type="date" defaultValue={today} required className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {t("createSubmit")}
      </button>
    </form>
  );
}
