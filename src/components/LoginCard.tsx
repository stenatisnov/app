import { Form } from "react-router";
import { useTranslations } from "@/i18n/translations";
import { Link } from "@/i18n/navigation";
import { StatusBanner } from "./StatusBanner";
import { PasswordInput } from "./PasswordInput";

export function LoginCard({ error, googleEnabled }: { error?: string; googleEnabled: boolean }) {
  const t = useTranslations("auth");

  return (
    <div className="card mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("loginTitle")}</h1>

      {error === "invalid" && <StatusBanner tone="danger">{t("invalidCredentials")}</StatusBanner>}

      <Form method="post" className="flex flex-col gap-3">
        <input type="email" name="email" placeholder={t("email")} required className="input" />
        <PasswordInput
          name="password"
          placeholder={t("password")}
          required
          autoComplete="current-password"
          showLabel={t("showPassword")}
          hideLabel={t("hidePassword")}
        />
        <button type="submit" className="btn btn-primary">
          {t("submit")}
        </button>
      </Form>

      <Link href="/register" className="btn btn-secondary w-full">
        {t("registerLink")}
      </Link>

      <Link
        href="/navod"
        className="flex items-center justify-between gap-2 rounded-xl border border-[var(--brand)] bg-[var(--bg-accent)] px-4 py-3 text-sm font-semibold text-[var(--brand-dark)]"
      >
        {t("guideLink")}
        <span aria-hidden="true">→</span>
      </Link>

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
          <a href="/api/auth/google" className="btn btn-secondary w-full text-center">
            {t("googleSignIn")}
          </a>
        </>
      )}
    </div>
  );
}
