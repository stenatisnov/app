import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

const SECTIONS = [
  ["users", "/admin/users"],
  ["groups", "/admin/groups"],
  ["pricing", "/admin/pricing"],
  ["payments", "/admin/payments"],
  ["guests", "/admin/guests"],
  ["settings", "/admin/settings"],
  ["logs", "/admin/logs"],
  ["stats", "/admin/stats"],
  ["loginQr", "/admin/login-qr"],
] as const;

export async function AdminNav() {
  const t = await getTranslations("admin.nav");
  return (
    <nav className="flex flex-wrap gap-x-4 gap-y-2 border-b border-neutral-200 pb-4 text-sm dark:border-neutral-800">
      {SECTIONS.map(([key, href]) => (
        <Link key={href} href={href} className="text-neutral-600 hover:text-brand dark:text-neutral-400">
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}
