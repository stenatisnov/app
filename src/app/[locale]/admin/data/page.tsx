import { getTranslations } from "next-intl/server";
import { ImportDataForm } from "@/components/ImportDataForm";
import { ManualBackupButtons } from "@/components/ManualBackupButtons";
import { ManualLogCleanupButton } from "@/components/ManualLogCleanupButton";
import { ManualPendingOrderCleanupButton } from "@/components/ManualPendingOrderCleanupButton";
import { requireRoot } from "@/lib/session";

export default async function AdminDataPage() {
  await requireRoot();
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

      <div className="card flex flex-col gap-3">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("manualBackupTitle")}</h2>
        <p className="text-sm text-[var(--muted)]">{t("manualBackupHint")}</p>
        <ManualBackupButtons />
      </div>

      <div className="card flex flex-col gap-3">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("manualLogCleanupTitle")}</h2>
        <p className="text-sm text-[var(--muted)]">{t("manualLogCleanupHint")}</p>
        <ManualLogCleanupButton />
      </div>

      <div className="card flex flex-col gap-3">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("manualPendingOrderCleanupTitle")}</h2>
        <p className="text-sm text-[var(--muted)]">{t("manualPendingOrderCleanupHint")}</p>
        <ManualPendingOrderCleanupButton />
      </div>
    </div>
  );
}
