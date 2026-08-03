import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { loginAction, googleSignInAction } from "@/app/actions";
import { StatusBanner } from "./StatusBanner";

export async function LoginCard({ error, googleEnabled }: { error?: string; googleEnabled: boolean }) {
  const t = await getTranslations("auth");

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("loginTitle")}</h1>

      {error === "invalid" && <StatusBanner tone="danger">{t("invalidCredentials")}</StatusBanner>}

      <form action={loginAction} className="flex flex-col gap-3">
        <input
          type="email"
          name="email"
          placeholder={t("email")}
          required
          className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700"
        />
        <input
          type="password"
          name="password"
          placeholder={t("password")}
          required
          className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700"
        />
        <button type="submit" className="rounded-md bg-brand px-4 py-2 font-medium text-white">
          {t("submit")}
        </button>
      </form>

      <Link href="/forgot-password" className="text-sm text-brand underline">
        {t("forgotPassword")}
      </Link>

      {googleEnabled && (
        <>
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
            {t("orDivider")}
            <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
          </div>
          <form action={googleSignInAction}>
            <button
              type="submit"
              className="w-full rounded-md border border-neutral-300 px-4 py-2 font-medium dark:border-neutral-700"
            >
              {t("googleSignIn")}
            </button>
          </form>
        </>
      )}

      <p className="text-sm text-neutral-500">
        {t("noAccount")}{" "}
        <Link href="/register" className="text-brand underline">
          {t("registerLink")}
        </Link>
      </p>
    </div>
  );
}
