"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { adminImportDataAction, type ImportDataResult } from "@/app/actions";
import { StatusBanner } from "./StatusBanner";

export function ImportDataForm() {
  const t = useTranslations("admin.data");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportDataResult | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await adminImportDataAction(formData);
      setResult(res);
      if (res.ok) formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-col gap-3">
      <label className="text-sm text-[var(--ink)]">
        {t("importFileLabel")}
        <input className="input mt-1" type="file" name="file" accept=".yaml,.yml,text/yaml" />
      </label>
      <label className="text-sm text-[var(--ink)]">
        {t("importPasteLabel")}
        <textarea
          className="input mt-1 font-mono text-xs"
          name="yaml"
          rows={10}
          placeholder={t("importPastePlaceholder")}
        />
      </label>
      <button type="submit" disabled={pending} className="btn btn-primary w-fit">
        {pending ? t("importing") : t("importSubmit")}
      </button>

      {result && !result.ok && <StatusBanner tone="danger">{result.message}</StatusBanner>}

      {result && result.ok && (
        <div className="banner banner-ok flex flex-col gap-1 text-sm">
          <p className="font-medium">{t("importSuccess")}</p>
          <ul className="list-disc pl-5">
            <li>
              {t("summaryPersonTypes", {
                created: result.summary.personTypes.created,
                updated: result.summary.personTypes.updated,
              })}
            </li>
            <li>
              {t("summaryPackages", {
                created: result.summary.packages.created,
                updated: result.summary.packages.updated,
              })}
            </li>
            <li>
              {t("summaryGroups", {
                created: result.summary.groups.created,
                updated: result.summary.groups.updated,
              })}
            </li>
            <li>
              {t("summaryUsers", {
                created: result.summary.users.created,
                updated: result.summary.users.updated,
              })}
            </li>
            <li>
              {t("summaryPeriodPasses", {
                created: result.summary.periodPasses.created,
                skipped: result.summary.periodPasses.skipped,
              })}
            </li>
            <li>
              {t("summaryDependents", {
                created: result.summary.dependents.created,
                updated: result.summary.dependents.updated,
              })}
            </li>
            <li>
              {t("summaryGuestPasses", {
                created: result.summary.guestPasses.created,
                updated: result.summary.guestPasses.updated,
              })}
            </li>
          </ul>
          {result.summary.errors.length > 0 && (
            <>
              <p className="mt-2 font-medium text-[var(--danger)]">{t("summaryErrors")}</p>
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
