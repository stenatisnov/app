import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/translations";
import type { adminCreateGuestPassAction } from "@/lib/actions/admin-guests";
import { toAppDateValue } from "@/lib/time";

const inputClass = "input !py-1.5 text-sm";
const primaryButtonClass = "btn btn-primary !px-3 !py-1.5 text-xs";

export function GuestCreateForm() {
  const t = useTranslations("admin");
  const fetcher = useFetcher<typeof adminCreateGuestPassAction>();
  const pending = fetcher.state !== "idle";
  const formRef = useRef<HTMLFormElement>(null);
  const today = toAppDateValue();

  useEffect(() => {
    if (fetcher.data?.ok) formRef.current?.reset();
  }, [fetcher.data]);

  function handleSubmit(formData: FormData) {
    formData.set("intent", "createGuestPass");
    fetcher.submit(formData, { method: "post" });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col text-xs text-[var(--muted)]">
        {t("guests.label")}
        <input name="label" className={inputClass} />
      </label>
      <label className="flex flex-col text-xs text-[var(--muted)]">
        {t("guests.maxUses")}
        <input name="maxUses" type="number" min={1} defaultValue={1} className={inputClass} />
      </label>
      <label className="flex flex-col text-xs text-[var(--muted)]">
        {t("guests.validFrom")}
        <input name="validFrom" type="date" defaultValue={today} required className={inputClass} />
      </label>
      <label className="flex flex-col text-xs text-[var(--muted)]">
        {t("guests.validTo")}
        <input name="validTo" type="date" defaultValue={today} required className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {t("guests.createSubmit")}
      </button>
    </form>
  );
}
