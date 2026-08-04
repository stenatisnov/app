import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { Link } from "@/i18n/navigation";
import { visibleAdminSections } from "@/lib/admin-nav";
import { isRootRole } from "@/lib/roles";
import { ADMIN_ICONS } from "./NavIcons";

/** Mobile-only (below sm) — desktop gets these same links expanded in AppSidebar instead. */
export async function AdminNav() {
  const [t, session] = await Promise.all([getTranslations("admin.nav"), auth()]);
  const sections = visibleAdminSections(isRootRole(session?.user.role));
  return (
    <nav className="flex flex-wrap gap-1.5 border-b border-[var(--line)] pb-4 text-sm sm:hidden">
      {sections.map(([key, href]) => {
        const Icon = ADMIN_ICONS[key];
        return (
          <Link key={href} href={href} className="btn btn-secondary !px-3 !py-1.5 text-sm">
            <Icon className="h-4 w-4 shrink-0" />
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
