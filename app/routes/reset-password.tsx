import { Form, data } from "react-router";
import type { Route } from "./+types/reset-password";
import { withLoadContext } from "@/lib/request-context.server";
import { resetPasswordAction } from "@/lib/actions/auth";
import { useTranslations } from "@/i18n/i18n.client";
import { StatusBanner } from "@/components/StatusBanner";

export async function loader({ request, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const params = new URL(request.url).searchParams;
    return data({ token: params.get("token") ?? "", error: params.get("error") ?? undefined });
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    return resetPasswordAction(formData, params.locale!);
  });
}

export default function ResetPasswordPage({ loaderData }: Route.ComponentProps) {
  const t = useTranslations("auth");
  const { token, error } = loaderData;

  return (
    <div className="card mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("resetTitle")}</h1>

      {error === "invalid" && <StatusBanner tone="danger">{t("resetInvalidToken")}</StatusBanner>}
      {error === "short" && <StatusBanner tone="danger">{t("registerErrorValidation")}</StatusBanner>}

      <Form method="post" className="flex flex-col gap-3">
        <input type="hidden" name="token" value={token} />
        <input type="password" name="password" placeholder={t("newPassword")} required minLength={8} className="input" />
        <button type="submit" className="btn btn-primary">
          {t("resetSubmit")}
        </button>
      </Form>
    </div>
  );
}
