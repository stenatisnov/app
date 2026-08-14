import { getTranslations } from "next-intl/server";
import { verifyEmailAction } from "@/app/actions";
import { StatusBanner } from "@/components/StatusBanner";
import { Link } from "@/i18n/navigation";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string; success?: string; approved?: string }>;
}) {
  const { token = "", error, success, approved } = await searchParams;
  const t = await getTranslations("auth");

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
            <form action={verifyEmailAction} className="flex flex-col gap-3">
              <p className="text-sm text-[var(--muted)]">{t("verifyEmailDescription")}</p>
              <input type="hidden" name="token" value={token} />
              <button type="submit" className="btn btn-primary">
                {t("verifyEmailSubmit")}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
