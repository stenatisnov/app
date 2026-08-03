import { getLocale, getTranslations } from "next-intl/server";
import { LoginQrCode } from "@/components/LoginQrCode";

export default async function AdminLoginQrPage() {
  const [t, locale] = await Promise.all([getTranslations("admin.loginQr"), getLocale()]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>
      <div className="card flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-[var(--muted)]">{t("description")}</p>
        <LoginQrCode locale={locale} />
      </div>
    </div>
  );
}
