import { getTranslations } from "next-intl/server";
import { requestPasswordResetAction } from "@/app/actions";
import { StatusBanner } from "@/components/StatusBanner";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;
  const t = await getTranslations("auth");

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("forgotTitle")}</h1>
      <p className="text-sm text-neutral-500">{t("forgotDescription")}</p>

      {sent && <StatusBanner tone="info">{t("forgotSent")}</StatusBanner>}

      <form action={requestPasswordResetAction} className="flex flex-col gap-3">
        <input
          type="email"
          name="email"
          placeholder={t("email")}
          required
          className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700"
        />
        <button type="submit" className="rounded-md bg-brand px-4 py-2 font-medium text-white">
          {t("forgotSubmit")}
        </button>
      </form>
    </div>
  );
}
