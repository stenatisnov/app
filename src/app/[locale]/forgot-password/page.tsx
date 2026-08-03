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
    <div className="card mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("forgotTitle")}</h1>
      <p className="text-sm text-[var(--muted)]">{t("forgotDescription")}</p>

      {sent && <StatusBanner tone="info">{t("forgotSent")}</StatusBanner>}

      <form action={requestPasswordResetAction} className="flex flex-col gap-3">
        <input type="email" name="email" placeholder={t("email")} required className="input" />
        <button type="submit" className="btn btn-primary">
          {t("forgotSubmit")}
        </button>
      </form>
    </div>
  );
}
