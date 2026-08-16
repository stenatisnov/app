import { useState } from "react";
import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/i18n.client";
import type { adminRunEmailVerificationSuspensionAction } from "@/lib/actions/admin-settings";
import { StatusBanner } from "./StatusBanner";
import { ConfirmDialog } from "./ConfirmDialog";

export function ManualEmailVerificationSuspensionButton() {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const fetcher = useFetcher<typeof adminRunEmailVerificationSuspensionAction>();
  const pending = fetcher.state !== "idle";
  const result = fetcher.data ?? null;
  const [confirmOpen, setConfirmOpen] = useState(false);

  function confirmAndRun() {
    setConfirmOpen(false);
    const fd = new FormData();
    fd.set("intent", "emailVerificationSuspension");
    fetcher.submit(fd, { method: "post" });
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => setConfirmOpen(true)} disabled={pending} className="btn btn-primary w-fit">
        {pending ? t("data.manualEmailVerificationSuspensionRunning") : t("data.manualEmailVerificationSuspensionButton")}
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title={t("data.manualEmailVerificationSuspensionButton")}
        message={t("data.manualEmailVerificationSuspensionConfirm")}
        confirmLabel={tCommon("confirm")}
        cancelLabel={tCommon("cancel")}
        onConfirm={confirmAndRun}
        onCancel={() => setConfirmOpen(false)}
      />

      {result &&
        (result.ok ? (
          <StatusBanner>{t("data.manualEmailVerificationSuspensionSuccess", { count: result.suspendedCount })}</StatusBanner>
        ) : (
          <StatusBanner tone="danger">{result.message}</StatusBanner>
        ))}
    </div>
  );
}
