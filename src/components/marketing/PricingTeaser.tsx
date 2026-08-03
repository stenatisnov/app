import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * Deliberately static — no DB query. Live packages and prices are shown
 * to logged-in members on `/buy`; this section only explains the model
 * so the marketing branch stays a self-contained, DB-free module.
 */
export async function PricingTeaser() {
  const t = await getTranslations("marketing");

  return (
    <section className="border-t border-[var(--line)] py-10">
      <h2 className="text-xl font-semibold text-[var(--ink)]">{t("pricingTitle")}</h2>
      <p className="mt-2 max-w-2xl text-[var(--muted)]">{t("pricingText")}</p>
      <Link href="/register" className="mt-3 inline-block text-[var(--brand)] underline">
        {t("pricingCtaText")}
      </Link>
    </section>
  );
}
