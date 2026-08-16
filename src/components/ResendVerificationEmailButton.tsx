import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/translations";
import type { resendVerificationEmailAction } from "@/lib/actions/auth";

export function ResendVerificationEmailButton() {
  const t = useTranslations("dashboard");
  const fetcher = useFetcher<typeof resendVerificationEmailAction>();
  const pending = fetcher.state !== "idle";
  const result = fetcher.data ?? null;

  function handleClick() {
    const fd = new FormData();
    fd.set("intent", "resendVerificationEmail");
    fetcher.submit(fd, { method: "post" });
  }

  return (
    <div className="mt-2 flex flex-col items-start gap-1.5">
      <button type="button" onClick={handleClick} disabled={pending} className="text-sm font-semibold underline">
        {pending ? t("resendVerificationSending") : t("resendVerificationButton")}
      </button>
      {result && (
        <p className="text-sm">{result.ok ? t("resendVerificationSuccess") : result.message}</p>
      )}
    </div>
  );
}
