import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/i18n.client";
import type { adminRunFioPollAction } from "@/lib/actions/admin-settings";
import { StatusBanner } from "./StatusBanner";

export function FioPollButton() {
  const t = useTranslations("admin");
  const fetcher = useFetcher<typeof adminRunFioPollAction>();
  const pending = fetcher.state !== "idle";
  const result = fetcher.data ?? null;

  function handleClick() {
    const fd = new FormData();
    fd.set("intent", "runFioPoll");
    fetcher.submit(fd, { method: "post" });
  }

  return (
    <div className="mt-3 flex flex-col items-start gap-2">
      <button type="button" onClick={handleClick} disabled={pending} className="btn btn-secondary !px-3 !py-1.5 text-xs">
        {pending ? t("settings.fioPollRunning") : t("settings.fioPollNowButton")}
      </button>
      {result &&
        (result.ok ? (
          <StatusBanner>{t("settings.fioPollSuccess", { count: result.matchedCount })}</StatusBanner>
        ) : (
          <StatusBanner tone="danger">{result.message}</StatusBanner>
        ))}
    </div>
  );
}
