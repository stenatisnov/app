import { Form, data } from "react-router";
import type { Route } from "./+types/forgot-password";
import { withLoadContext } from "@/lib/request-context.server";
import { requestPasswordResetAction } from "@/lib/actions/auth";
import { useTranslations } from "@/i18n/i18n.client";
import { StatusBanner } from "@/components/StatusBanner";

export async function loader({ request, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const sent = new URL(request.url).searchParams.get("sent") ?? undefined;
    return data({ sent });
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    return requestPasswordResetAction(formData, params.locale!);
  });
}

export default function ForgotPasswordPage({ loaderData }: Route.ComponentProps) {
  const t = useTranslations("auth");

  return (
    <div className="card mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("forgotTitle")}</h1>
      <p className="text-sm text-[var(--muted)]">{t("forgotDescription")}</p>

      {loaderData.sent && <StatusBanner tone="info">{t("forgotSent")}</StatusBanner>}

      <Form method="post" className="flex flex-col gap-3">
        <input type="email" name="email" placeholder={t("email")} required className="input" />
        <button type="submit" className="btn btn-primary">
          {t("forgotSubmit")}
        </button>
      </Form>
    </div>
  );
}
