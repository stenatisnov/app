import { data, redirect } from "react-router";
import type { Route } from "./+types/join.$token";
import { getPrisma } from "@/lib/db.server";
import { withLoadContext } from "@/lib/request-context.server";
import { registerAction } from "@/lib/actions/auth";
import { useTranslations, Trans } from "@/i18n/translations";
import { Link } from "@/i18n/navigation";
import { StatusBanner } from "@/components/StatusBanner";
import { RegisterForm } from "@/components/RegisterForm";

/** Registration entry point reached from a ChildGroup's invite link — same registerAction as /register, just with the group pre-filled (hidden field) and no Google sign-up (that'd need the token carried through OAuth state, not worth it for this flow). */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const prisma = await getPrisma();
    const token = params.token!;
    const group = await prisma.childGroup.findUnique({ where: { inviteToken: token }, select: { id: true, name: true } });
    if (!group) throw redirect(`/${params.locale}/register?error=invalidGroupLink`);
    const error = new URL(request.url).searchParams.get("error") ?? undefined;
    return data({ token, groupName: group.name, error });
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    return registerAction(formData, request, params.locale!);
  });
}

export default function JoinChildGroupPage({ loaderData }: Route.ComponentProps) {
  const t = useTranslations("auth");
  const { token, groupName, error } = loaderData;

  return (
    <div className="card mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("registerTitle")}</h1>
      <StatusBanner tone="info">{t("joinGroupHint", { name: groupName })}</StatusBanner>

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
        groupToken={token}
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

      <Link href="/login" className="btn btn-secondary w-full">
        {t("loginLink")}
      </Link>
    </div>
  );
}
