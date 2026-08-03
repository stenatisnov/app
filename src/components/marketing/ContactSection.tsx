import { getTranslations } from "next-intl/server";

export async function ContactSection() {
  const t = await getTranslations("marketing");

  return (
    <section className="border-t border-[var(--line)] py-10">
      <h2 className="text-xl font-semibold text-[var(--ink)]">{t("contactTitle")}</h2>
      <p className="mt-2 max-w-2xl text-[var(--muted)]">{t("contactText")}</p>
    </section>
  );
}
