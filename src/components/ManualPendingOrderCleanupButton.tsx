import { useState } from "react";
import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/i18n.client";
import type { adminRunPendingOrderCleanupAction } from "@/lib/actions/admin-settings";
import { StatusBanner } from "./StatusBanner";
import { ConfirmDialog } from "./ConfirmDialog";

export function ManualPendingOrderCleanupButton() {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const fetcher = useFetcher<typeof adminRunPendingOrderCleanupAction>();
  const pending = fetcher.state !== "idle";
  const result = fetcher.data ?? null;
  const [confirmOpen, setConfirmOpen] = useState(false);

  function confirmAndRun() {
    setConfirmOpen(false);
    const fd = new FormData();
    fd.set("intent", "pendingOrderCleanup");
    fetcher.submit(fd, { method: "post" });
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => setConfirmOpen(true)} disabled={pending} className="btn btn-primary w-fit">
        {pending ? t("data.manualPendingOrderCleanupRunning") : t("data.manualPendingOrderCleanupButton")}
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title={t("data.manualPendingOrderCleanupButton")}
        message={t("data.manualPendingOrderCleanupConfirm")}
        confirmLabel={tCommon("confirm")}
        cancelLabel={tCommon("cancel")}
        onConfirm={confirmAndRun}
        onCancel={() => setConfirmOpen(false)}
      />

      {result &&
        (result.ok ? (
          <StatusBanner>{t("data.manualPendingOrderCleanupSuccess", { count: result.deletedCount })}</StatusBanner>
        ) : (
          <StatusBanner tone="danger">{result.message}</StatusBanner>
        ))}
    </div>
  );
}
