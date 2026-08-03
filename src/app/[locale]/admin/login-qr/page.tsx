import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { loginUrl, requestAppUrl } from "@/lib/app-url";
import { qrDataUrl } from "@/lib/qr";

export default async function AdminLoginQrPage() {
  const [t, locale, base] = await Promise.all([
    getTranslations("admin.loginQr"),
    getLocale(),
    requestAppUrl(),
  ]);
  const url = loginUrl(locale, base);
  const qr = await qrDataUrl(url);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>
      <div className="card flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-[var(--muted)]">{t("description")}</p>
        <Image src={qr} alt="QR" width={260} height={260} unoptimized />
        <code className="text-xs text-[var(--muted)]">{url}</code>
      </div>
    </div>
  );
}
