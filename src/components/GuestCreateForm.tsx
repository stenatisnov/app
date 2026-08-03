"use client";

import { useRef, useTransition } from "react";
import { useTranslations } from "next-intl";
import { adminCreateGuestPassAction } from "@/app/actions";

const inputClass = "rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700";
const primaryButtonClass = "rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white";

export function GuestCreateForm() {
  const t = useTranslations("admin.guests");
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await adminCreateGuestPassAction(formData);
      if (result?.ok) formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col text-xs text-neutral-500">
        {t("label")}
        <input name="label" className={inputClass} />
      </label>
      <label className="flex flex-col text-xs text-neutral-500">
        {t("maxUses")}
        <input name="maxUses" type="number" min={1} defaultValue={1} className={inputClass} />
      </label>
      <label className="flex flex-col text-xs text-neutral-500">
        {t("validFrom")}
        <input name="validFrom" type="datetime-local" required className={inputClass} />
      </label>
      <label className="flex flex-col text-xs text-neutral-500">
        {t("validTo")}
        <input name="validTo" type="datetime-local" required className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {t("createSubmit")}
      </button>
    </form>
  );
}
