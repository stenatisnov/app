import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function Hero() {
  const t = await getTranslations("marketing");

  return (
    <section className="flex flex-col items-center gap-4 py-12 text-center">
      <h1 className="text-3xl font-bold sm:text-4xl">{t("heroTitle")}</h1>
      <p className="max-w-md text-neutral-600 dark:text-neutral-400">{t("heroSubtitle")}</p>
      <div className="flex gap-3">
        <Link href="/register" className="rounded-md bg-brand px-5 py-2.5 font-medium text-white">
          {t("heroCtaRegister")}
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-neutral-300 px-5 py-2.5 font-medium dark:border-neutral-700"
        >
          {t("heroCtaLogin")}
        </Link>
      </div>
    </section>
  );
}
