import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/translations";
import type { recordCashPaymentAction } from "@/lib/actions/cash";

export function CashForm() {
  const t = useTranslations("cash");
  const fetcher = useFetcher<typeof recordCashPaymentAction>();
  const pending = fetcher.state !== "idle";
  const formRef = useRef<HTMLFormElement>(null);
  const [lastEmail, setLastEmail] = useState<string | null>(null);

  useEffect(() => {
    if (fetcher.data?.ok) formRef.current?.reset();
  }, [fetcher.data]);

  function handleSubmit(formData: FormData) {
    setLastEmail(String(formData.get("email") || "").trim() || null);
    formData.set("intent", "recordCash");
    fetcher.submit(formData, { method: "post" });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("hint")}</p>
      </div>

      <form ref={formRef} action={handleSubmit} className="card flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("amountLabel")}
          <input name="amountCzk" type="number" min={1} step={1} required className="input !py-1.5 w-32 text-sm" />
        </label>
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("emailLabel")}
          <input name="email" type="email" className="input !py-1.5 w-64 text-sm" />
        </label>
        <button type="submit" disabled={pending} className="btn btn-primary !px-3 !py-1.5 text-sm disabled:opacity-50">
          {pending ? t("recording") : t("submit")}
        </button>
      </form>

      {fetcher.data?.ok && (
        <p className="text-sm text-[var(--ink)]">
          {t("resultPok", { pok: fetcher.data.pok })}
          {lastEmail ? ` ${t("receiptSent", { email: lastEmail })}` : null}
        </p>
      )}
      {fetcher.data && !fetcher.data.ok && (
        <p className="text-sm text-[var(--danger)]">
          {fetcher.data.error === "validation" ? t("errorValidation") : t("errorGeneric")}
        </p>
      )}
    </div>
  );
}
