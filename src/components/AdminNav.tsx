import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ADMIN_SECTIONS } from "@/lib/admin-nav";

/** Mobile-only (below sm) — desktop gets these same links expanded in AppSidebar instead. */
export async function AdminNav() {
  const t = await getTranslations("admin.nav");
  return (
    <nav className="flex flex-wrap gap-1.5 border-b border-[var(--line)] pb-4 text-sm sm:hidden">
      {ADMIN_SECTIONS.map(([key, href]) => (
        <Link key={href} href={href} className="btn btn-secondary !px-3 !py-1.5 text-sm">
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}
