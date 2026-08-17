import { data } from "react-router";
import type { Route } from "./+types/register";
import { withLoadContext } from "@/lib/request-context.server";
import { registerAction } from "@/lib/actions/auth";
import { isGoogleOAuthEnabled } from "@/lib/google-auth.server";
import { useTranslations, Trans } from "@/i18n/translations";
import { Link } from "@/i18n/navigation";
import { StatusBanner } from "@/components/StatusBanner";
import { RegisterForm } from "@/components/RegisterForm";
import { GoogleIcon } from "@/components/GoogleIcon";

export async function loader({ request, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const error = new URL(request.url).searchParams.get("error") ?? undefined;
    const googleEnabled = await isGoogleOAuthEnabled();
    return data({ error, googleEnabled });
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    return registerAction(formData, request, params.locale!);
  });
}

export default function RegisterPage({ loaderData }: Route.ComponentProps) {
  const t = useTranslations("auth");
  const { error, googleEnabled } = loaderData;

  return (
    <div className="card mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("registerTitle")}</h1>

      {error === "exists" && <StatusBanner tone="danger">{t("registerErrorExists")}</StatusBanner>}
      {error === "validation" && <StatusBanner tone="danger">{t("registerErrorValidation")}</StatusBanner>}
      {error === "mismatch" && <StatusBanner tone="danger">{t("registerErrorMismatch")}</StatusBanner>}
      {error === "tooYoung" && (
        <StatusBanner tone="danger">
          <Trans
            t={t}
            i18nKey="registerErrorTooYoung"
            components={{ link: <Link href="/account" className="font-semibold underline" /> }}
          />
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
          passwordMismatch: t("registerErrorMismatch"),
          agreeRulesPrefix: t("agreeRulesPrefix"),
          agreeRulesLinkText: t("agreeRulesLinkText"),
          registerSubmit: t("registerSubmit"),
          registerSubmitPending: t("registerSubmitPending"),
        }}
      />

      {googleEnabled && (
        <>
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <div className="h-px flex-1 bg-[var(--line)]" />
            {t("orDivider")}
            <div className="h-px flex-1 bg-[var(--line)]" />
          </div>
          <a href="/api/auth/google" className="btn btn-secondary w-full text-center">
            <GoogleIcon className="h-4.5 w-4.5 shrink-0" />
            {t("googleSignUp")}
          </a>
        </>
      )}

      <Link href="/login" className="btn btn-secondary w-full">
        {t("loginLink")}
      </Link>
    </div>
  );
}
