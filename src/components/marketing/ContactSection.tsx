import { getTranslations } from "next-intl/server";

export async function ContactSection() {
  const t = await getTranslations("marketing");

  return (
    <section className="border-t border-neutral-200 py-10 dark:border-neutral-800">
      <h2 className="text-xl font-semibold">{t("contactTitle")}</h2>
      <p className="mt-2 max-w-2xl text-neutral-600 dark:text-neutral-400">{t("contactText")}</p>
    </section>
  );
}
