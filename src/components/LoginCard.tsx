import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { loginAction, googleSignInAction } from "@/app/actions";
import { StatusBanner } from "./StatusBanner";

export async function LoginCard({ error, googleEnabled }: { error?: string; googleEnabled: boolean }) {
  const t = await getTranslations("auth");

  return (
    <div className="card mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("loginTitle")}</h1>

      {error === "invalid" && <StatusBanner tone="danger">{t("invalidCredentials")}</StatusBanner>}

      <form action={loginAction} className="flex flex-col gap-3">
        <input type="email" name="email" placeholder={t("email")} required className="input" />
        <input type="password" name="password" placeholder={t("password")} required className="input" />
        <button type="submit" className="btn btn-primary">
          {t("submit")}
        </button>
      </form>

      <Link href="/forgot-password" className="text-sm text-[var(--brand)] underline">
        {t("forgotPassword")}
      </Link>

      {googleEnabled && (
        <>
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <div className="h-px flex-1 bg-[var(--line)]" />
            {t("orDivider")}
            <div className="h-px flex-1 bg-[var(--line)]" />
          </div>
          <form action={googleSignInAction}>
            <button type="submit" className="btn btn-secondary w-full">
              {t("googleSignIn")}
            </button>
          </form>
        </>
      )}

      <p className="text-sm text-[var(--muted)]">
        {t("noAccount")}{" "}
        <Link href="/register" className="text-[var(--brand)] underline">
          {t("registerLink")}
        </Link>
      </p>
    </div>
  );
}
