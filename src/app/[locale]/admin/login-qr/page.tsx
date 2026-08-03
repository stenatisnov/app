import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { loginUrl } from "@/lib/app-url";
import { qrDataUrl } from "@/lib/qr";

export default async function AdminLoginQrPage() {
  const [t, locale] = await Promise.all([getTranslations("admin.loginQr"), getLocale()]);
  const url = loginUrl(locale);
  const qr = await qrDataUrl(url);

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-neutral-500">{t("description")}</p>
      <Image src={qr} alt="QR" width={260} height={260} unoptimized />
      <code className="text-xs text-neutral-400">{url}</code>
    </div>
  );
}
