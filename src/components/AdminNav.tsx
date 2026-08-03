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
    <nav className="flex flex-wrap gap-1.5 border-b border-[var(--line)] pb-4 text-sm">
      {SECTIONS.map(([key, href]) => (
        <Link key={href} href={href} className="btn btn-secondary !px-3 !py-1.5 text-sm">
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}
