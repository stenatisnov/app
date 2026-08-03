import { getTranslations } from "next-intl/server";
import { resetPasswordAction } from "@/app/actions";
import { StatusBanner } from "@/components/StatusBanner";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token = "", error } = await searchParams;
  const t = await getTranslations("auth");

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("resetTitle")}</h1>

      {error === "invalid" && <StatusBanner tone="danger">{t("resetInvalidToken")}</StatusBanner>}
      {error === "short" && <StatusBanner tone="danger">{t("registerErrorValidation")}</StatusBanner>}

      <form action={resetPasswordAction} className="flex flex-col gap-3">
        <input type="hidden" name="token" value={token} />
        <input
          type="password"
          name="password"
          placeholder={t("newPassword")}
          required
          minLength={8}
          className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700"
        />
        <button type="submit" className="rounded-md bg-brand px-4 py-2 font-medium text-white">
          {t("resetSubmit")}
        </button>
      </form>
    </div>
  );
}
