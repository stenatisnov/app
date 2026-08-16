import type { Route } from "./+types/login-qr";
import { useTranslations } from "@/i18n/translations";
import { LoginQrCode } from "@/components/LoginQrCode";

export default function AdminLoginQrPage({ params }: Route.ComponentProps) {
  const t = useTranslations("admin");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("loginQr.title")}</h1>
      <div className="card flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-[var(--muted)]">{t("loginQr.description")}</p>
        <LoginQrCode locale={params.locale!} />
      </div>
    </div>
  );
}
