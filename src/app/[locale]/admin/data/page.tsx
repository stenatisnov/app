import { getTranslations } from "next-intl/server";
import { ImportDataForm } from "@/components/ImportDataForm";

export default async function AdminDataPage() {
  const t = await getTranslations("admin.data");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>

      <div className="card flex flex-col gap-3">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("exportTitle")}</h2>
        <p className="text-sm text-[var(--muted)]">{t("exportHint")}</p>
        <a href="/api/admin/data.yaml" className="btn btn-primary w-fit">
          {t("exportButton")}
        </a>
      </div>

      <div className="card flex flex-col gap-3">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("importTitle")}</h2>
        <p className="text-sm text-[var(--muted)]">{t("importHint")}</p>
        <ImportDataForm />
      </div>
    </div>
  );
}
