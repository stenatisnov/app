import { data } from "react-router";
import type { Route } from "./+types/data";
import { requireRoot } from "@/lib/session.server";
import { withLoadContext } from "@/lib/request-context.server";
import { useTranslations } from "@/i18n/i18n.client";
import { ImportDataForm } from "@/components/ImportDataForm";
import { ManualBackupButtons } from "@/components/ManualBackupButtons";
import { ManualLogCleanupButton } from "@/components/ManualLogCleanupButton";
import { ManualPendingOrderCleanupButton } from "@/components/ManualPendingOrderCleanupButton";
import { ManualEmailVerificationSuspensionButton } from "@/components/ManualEmailVerificationSuspensionButton";
import { adminImportDataAction } from "@/lib/actions/admin-data";
import {
  adminRunConfigBackupAction,
  adminRunDatabaseDumpAction,
  adminRunEmailVerificationSuspensionAction,
  adminRunLogCleanupAction,
  adminRunPendingOrderCleanupAction,
  adminRunTransactionBackupAction,
} from "@/lib/actions/admin-settings";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    await requireRoot(request, params.locale!);
    return null;
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    await requireRoot(request, params.locale!);
    const formData = await request.formData();
    const intent = String(formData.get("intent"));
    switch (intent) {
      case "importData":
        return adminImportDataAction(formData);
      case "configBackup":
        return adminRunConfigBackupAction();
      case "transactionBackup":
        return adminRunTransactionBackupAction();
      case "databaseDump":
        return adminRunDatabaseDumpAction();
      case "logCleanup":
        return adminRunLogCleanupAction();
      case "pendingOrderCleanup":
        return adminRunPendingOrderCleanupAction();
      case "emailVerificationSuspension":
        return adminRunEmailVerificationSuspensionAction();
      default:
        throw data(null, { status: 400 });
    }
  });
}

export default function AdminDataPage() {
  const t = useTranslations("admin");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("data.title")}</h1>

      <div className="card flex flex-col gap-3">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("data.exportTitle")}</h2>
        <p className="text-sm text-[var(--muted)]">{t("data.exportHint")}</p>
        <a href="/api/admin/data.yaml" className="btn btn-primary w-fit">
          {t("data.exportButton")}
        </a>
      </div>

      <div className="card flex flex-col gap-3">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("data.importTitle")}</h2>
        <p className="text-sm text-[var(--muted)]">{t("data.importHint")}</p>
        <ImportDataForm />
      </div>

      <div className="card flex flex-col gap-3">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("data.manualBackupTitle")}</h2>
        <p className="text-sm text-[var(--muted)]">{t("data.manualBackupHint")}</p>
        <ManualBackupButtons />
      </div>

      <div className="card flex flex-col gap-3">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("data.manualLogCleanupTitle")}</h2>
        <p className="text-sm text-[var(--muted)]">{t("data.manualLogCleanupHint")}</p>
        <ManualLogCleanupButton />
      </div>

      <div className="card flex flex-col gap-3">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("data.manualPendingOrderCleanupTitle")}</h2>
        <p className="text-sm text-[var(--muted)]">{t("data.manualPendingOrderCleanupHint")}</p>
        <ManualPendingOrderCleanupButton />
      </div>

      <div className="card flex flex-col gap-3">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("data.manualEmailVerificationSuspensionTitle")}</h2>
        <p className="text-sm text-[var(--muted)]">{t("data.manualEmailVerificationSuspensionHint")}</p>
        <ManualEmailVerificationSuspensionButton />
      </div>
    </div>
  );
}
