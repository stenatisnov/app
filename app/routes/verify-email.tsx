import { Form, data } from "react-router";
import type { Route } from "./+types/verify-email";
import { withLoadContext } from "@/lib/request-context.server";
import { verifyEmailAction } from "@/lib/actions/auth";
import { useTranslations } from "@/i18n/translations";
import { Link } from "@/i18n/navigation";
import { StatusBanner } from "@/components/StatusBanner";

export async function loader({ request, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const params = new URL(request.url).searchParams;
    return data({
      token: params.get("token") ?? "",
      error: params.get("error") ?? undefined,
      success: params.get("success") ?? undefined,
      approved: params.get("approved") ?? undefined,
    });
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    return verifyEmailAction(formData, params.locale!);
  });
}

export default function VerifyEmailPage({ loaderData }: Route.ComponentProps) {
  const t = useTranslations("auth");
  const { token, error, success, approved } = loaderData;

  return (
    <div className="card mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("verifyEmailTitle")}</h1>

      {success === "1" ? (
        <>
          <StatusBanner>{t("verifyEmailSuccess")}</StatusBanner>
          {approved === "1" && <StatusBanner>{t("verifyEmailApproved")}</StatusBanner>}
          <Link href="/" className="btn btn-primary">
            {t("verifyEmailContinue")}
          </Link>
        </>
      ) : (
        <>
          {error === "invalid" && <StatusBanner tone="danger">{t("verifyEmailInvalidToken")}</StatusBanner>}
          {!token && !error && <StatusBanner tone="danger">{t("verifyEmailInvalidToken")}</StatusBanner>}

          {token && (
            <Form method="post" className="flex flex-col gap-3">
              <p className="text-sm text-[var(--muted)]">{t("verifyEmailDescription")}</p>
              <input type="hidden" name="token" value={token} />
              <button type="submit" className="btn btn-primary">
                {t("verifyEmailSubmit")}
              </button>
            </Form>
          )}
        </>
      )}
    </div>
  );
}
