import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { StatusBanner } from "@/components/StatusBanner";
import { RegisterForm } from "@/components/RegisterForm";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const t = await getTranslations("auth");

  return (
    <div className="card mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("registerTitle")}</h1>

      {error === "exists" && <StatusBanner tone="danger">{t("registerErrorExists")}</StatusBanner>}
      {error === "validation" && <StatusBanner tone="danger">{t("registerErrorValidation")}</StatusBanner>}
      {error === "mismatch" && <StatusBanner tone="danger">{t("registerErrorMismatch")}</StatusBanner>}
      {error === "tooYoung" && (
        <StatusBanner tone="danger">
          {t.rich("registerErrorTooYoung", {
            link: (chunks) => (
              <Link href="/account" className="font-semibold underline">
                {chunks}
              </Link>
            ),
          })}
        </StatusBanner>
      )}

      <RegisterForm
        labels={{
          name: t("name"),
          email: t("email"),
          phone: t("phone"),
          birthDate: t("birthDate"),
          pickDate: t("pickDate"),
          password: t("password"),
          confirmPassword: t("confirmPassword"),
          showPassword: t("showPassword"),
          hidePassword: t("hidePassword"),
          passwordTooShort: t("passwordTooShort"),
          agreeRulesPrefix: t("agreeRulesPrefix"),
          agreeRulesLinkText: t("agreeRulesLinkText"),
          registerSubmit: t("registerSubmit"),
          registerSubmitPending: t("registerSubmitPending"),
        }}
      />

      <p className="text-sm text-[var(--muted)]">
        {t("haveAccount")}{" "}
        <Link href="/login" className="text-[var(--brand)] underline">
          {t("loginLink")}
        </Link>
      </p>
    </div>
  );
}
