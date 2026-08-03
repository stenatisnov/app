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
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("registerTitle")}</h1>

      {error === "exists" && <StatusBanner tone="danger">{t("registerErrorExists")}</StatusBanner>}
      {error === "validation" && <StatusBanner tone="danger">{t("registerErrorValidation")}</StatusBanner>}

      <form action={registerAction} className="flex flex-col gap-3">
        <input
          type="text"
          name="name"
          placeholder={t("name")}
          required
          className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700"
        />
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
          minLength={8}
          className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700"
        />
        <button type="submit" className="rounded-md bg-brand px-4 py-2 font-medium text-white">
          {t("registerSubmit")}
        </button>
      </form>

      <p className="text-sm text-neutral-500">
        {t("haveAccount")}{" "}
        <Link href="/login" className="text-brand underline">
          {t("loginLink")}
        </Link>
      </p>
    </div>
  );
}
