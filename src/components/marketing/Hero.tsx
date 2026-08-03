import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function Hero() {
  const t = await getTranslations("marketing");

  return (
    <section className="flex flex-col items-center gap-4 py-12 text-center">
      <h1 className="font-[family-name:var(--font-brand)] text-3xl font-bold text-[var(--brand-dark)] sm:text-4xl">
        {t("heroTitle")}
      </h1>
      <p className="max-w-md text-[var(--muted)]">{t("heroSubtitle")}</p>
      <div className="flex gap-3">
        <Link href="/register" className="btn btn-primary">
          {t("heroCtaRegister")}
        </Link>
        <Link href="/login" className="btn btn-secondary">
          {t("heroCtaLogin")}
        </Link>
      </div>
    </section>
  );
}
