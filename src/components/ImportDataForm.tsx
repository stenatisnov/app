import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/translations";
import type { adminImportDataAction } from "@/lib/actions/admin-data";
import { StatusBanner } from "./StatusBanner";

export function ImportDataForm() {
  const t = useTranslations("admin");
  const fetcher = useFetcher<typeof adminImportDataAction>();
  const pending = fetcher.state !== "idle";
  const result = fetcher.data ?? null;
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (result?.ok) formRef.current?.reset();
  }, [result]);

  function handleSubmit(formData: FormData) {
    formData.set("intent", "importData");
    fetcher.submit(formData, { method: "post", encType: "multipart/form-data" });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-col gap-3">
      <label className="text-sm text-[var(--ink)]">
        {t("data.importFileLabel")}
        <input className="input mt-1" type="file" name="file" accept=".yaml,.yml,text/yaml" />
      </label>
      <label className="text-sm text-[var(--ink)]">
        {t("data.importPasteLabel")}
        <textarea
          className="input mt-1 font-mono text-xs"
          name="yaml"
          rows={10}
          placeholder={t("data.importPastePlaceholder")}
        />
      </label>
      <button type="submit" disabled={pending} className="btn btn-primary w-fit">
        {pending ? t("data.importing") : t("data.importSubmit")}
      </button>

      {result && !result.ok && <StatusBanner tone="danger">{result.message}</StatusBanner>}

      {result && result.ok && (
        <div className="banner banner-ok flex flex-col gap-1 text-sm">
          <p className="font-medium">{t("data.importSuccess")}</p>
          <ul className="list-disc pl-5">
            <li>
              {t("data.summaryPersonTypes", {
                created: result.summary.personTypes.created,
                updated: result.summary.personTypes.updated,
              })}
            </li>
            <li>
              {t("data.summaryPackages", {
                created: result.summary.packages.created,
                updated: result.summary.packages.updated,
              })}
            </li>
            <li>
              {t("data.summaryGroups", {
                created: result.summary.groups.created,
                updated: result.summary.groups.updated,
              })}
            </li>
            <li>
              {t("data.summaryUsers", {
                created: result.summary.users.created,
                updated: result.summary.users.updated,
              })}
            </li>
            <li>
              {t("data.summaryPeriodPasses", {
                created: result.summary.periodPasses.created,
                skipped: result.summary.periodPasses.skipped,
              })}
            </li>
            <li>
              {t("data.summaryDependents", {
                created: result.summary.dependents.created,
                updated: result.summary.dependents.updated,
              })}
            </li>
            <li>
              {t("data.summaryGuestPasses", {
                created: result.summary.guestPasses.created,
                updated: result.summary.guestPasses.updated,
              })}
            </li>
          </ul>
          {result.summary.errors.length > 0 && (
            <>
              <p className="mt-2 font-medium text-[var(--danger)]">{t("data.summaryErrors")}</p>
              <ul className="list-disc pl-5 text-[var(--danger)]">
                {result.summary.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </form>
  );
}
