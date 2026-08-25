import { useTranslations } from "@/i18n/translations";
import { BottomTabLink } from "./BottomTabLink";
import { MoreSheet } from "./MoreSheet";
import { NavLink } from "./NavLink";
import { NAV_ICONS, ADMIN_ICONS } from "./NavIcons";
import { navItemsForRole, mobilePrimaryKeys, visibleAdminSections } from "@/lib/nav-config";
import { isAdminRole, isRootRole } from "@/lib/roles";
import type { SessionUser } from "@/lib/session.server";

/** Short label for a primary tab (narrow, icon + label) — the "More" sheet has room to spare and keeps the full nav.* label instead. */
function primaryLabel(key: string, tNav: (key: string) => string): string {
  switch (key) {
    case "account":
      return tNav("accountTab");
    case "dashboard":
      return tNav("dashboardTab");
    case "paymentCheck":
      return tNav("paymentCheckTab");
    case "setPersonType":
      return tNav("setPersonTypeTab");
    default:
      return tNav(key);
  }
}

/**
 * Mobile-only (below sm) fixed bottom nav — replaces AppHeader's old
 * wrapping pill-row. 3-5 primary tabs (role-dependent, from nav.yaml's
 * mobile_primary) plus a "More" sheet for everything else in that role's
 * menu. Desktop keeps AppSidebar, unchanged. Anonymous visitors get no bar
 * at all — Login/Register live in AppTopBar.
 */
export function BottomTabBar({ user, logbookEnabled }: { user: SessionUser | null; logbookEnabled: boolean }) {
  const tNav = useTranslations("nav");
  const tAdmin = useTranslations("admin");
  const tAdminNav = (key: string) => tAdmin(`nav.${key}`);

  if (!user) return null;

  const isAdmin = isAdminRole(user.role);

  const items = navItemsForRole(user.role, logbookEnabled);
  const hrefByKey = new Map(items);
  const primaryKeys = new Set(mobilePrimaryKeys(user.role));
  // Primary row follows nav.yaml's own mobile_primary order (it deliberately
  // differs from the desktop menu order, e.g. ADMIN puts "account" last in
  // the tab row but first in the sidebar) — not the desktop list's order.
  const primary = mobilePrimaryKeys(user.role)
    .filter((key) => hrefByKey.has(key))
    .map((key) => [key, hrefByKey.get(key)!] as const);
  const overflow = items
    .filter(([key]) => !primaryKeys.has(key))
    .map(([key, href]) => [key, href, tNav(key)] as const);

  const adminSections = isAdmin ? visibleAdminSections(isRootRole(user.role)) : [];
  const overflowHrefs = [...overflow.map(([, href]) => href), ...adminSections.map(([, href]) => href)];

  return (
    <nav className="tab-bar fixed inset-x-0 bottom-0 z-40 flex sm:hidden">
      <div className="mx-auto flex w-full max-w-6xl">
        {primary.map(([key, href]) => {
          const Icon = NAV_ICONS[key as keyof typeof NAV_ICONS];
          return <BottomTabLink key={href} href={href} icon={<Icon className="h-6 w-6" />} label={primaryLabel(key, tNav)} />;
        })}
        {overflowHrefs.length > 0 && (
          <MoreSheet label={tNav("more")} heading={tNav("menu")} hrefs={overflowHrefs}>
            {overflow.map(([key, href, label]) => {
              const Icon = NAV_ICONS[key as keyof typeof NAV_ICONS];
              return (
                <NavLink key={href} href={href} layout="list">
                  {Icon && <Icon className="h-4 w-4 shrink-0" />}
                  <span className="truncate">{label}</span>
                </NavLink>
              );
            })}
            {adminSections.length > 0 && (
              <>
                <hr className="my-1 border-t border-[var(--line)]" />
                {adminSections.map(([key, href]) => {
                  const Icon = ADMIN_ICONS[key as keyof typeof ADMIN_ICONS];
                  return (
                    <NavLink key={href} href={href} layout="list">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{tAdminNav(key)}</span>
                    </NavLink>
                  );
                })}
              </>
            )}
          </MoreSheet>
        )}
      </div>
    </nav>
  );
}
