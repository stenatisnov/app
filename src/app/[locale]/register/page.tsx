import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { registerAction } from "@/app/actions";
import { StatusBanner } from "@/components/StatusBanner";

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

      <form action={registerAction} className="flex flex-col gap-3">
        <input type="text" name="name" placeholder={t("name")} required className="input" />
        <input type="email" name="email" placeholder={t("email")} required className="input" />
        <input type="tel" name="phone" placeholder={t("phone")} className="input" />
        <input type="password" name="password" placeholder={t("password")} required minLength={8} className="input" />

        <label className="flex items-start gap-2.5 rounded-lg border border-[var(--brand)] bg-[var(--bg-accent)] px-3 py-2.5 text-sm font-medium text-[var(--ink)]">
          <input type="checkbox" name="agreedRules" required className="mt-0.5 h-4 w-4 flex-none accent-[var(--brand)]" />
          <span>
            {t("agreeRulesPrefix")}{" "}
            <a
              href="https://stenatisnov.cz/wp-content/uploads/2026/04/Provozni_rad_FINAL.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[var(--brand-dark)] underline"
            >
              {t("agreeRulesLinkText")}
            </a>
            .
          </span>
        </label>

        <button type="submit" className="btn btn-primary">
          {t("registerSubmit")}
        </button>
      </form>

      <p className="text-sm text-[var(--muted)]">
        {t("haveAccount")}{" "}
        <Link href="/login" className="text-[var(--brand)] underline">
          {t("loginLink")}
        </Link>
      </p>
    </div>
  );
}
