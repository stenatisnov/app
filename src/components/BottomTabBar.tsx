import { getTranslations } from "next-intl/server";
import { BottomTabLink } from "./BottomTabLink";
import { MoreSheet } from "./MoreSheet";
import { NavLink } from "./NavLink";
import { NAV_ICONS, ADMIN_ICONS } from "./NavIcons";
import { visibleAdminSections } from "@/lib/admin-nav";
import { isAdminRole, isRootRole, isStaffOrAbove, isStaffOnlyRole } from "@/lib/roles";
import type { SessionUser } from "./AppShell";

/**
 * Mobile-only (below sm) fixed bottom nav — replaces AppHeader's old
 * wrapping pill-row. 3-5 primary tabs (role-dependent) plus a "More" sheet
 * for secondary/role-specific items. Desktop keeps AppSidebar, unchanged.
 * Anonymous visitors get no bar at all — Login/Register live in AppTopBar.
 */
export async function BottomTabBar({ user }: { user: SessionUser }) {
  if (!user) return null;

  const [tNav, tAdminNav] = await Promise.all([getTranslations("nav"), getTranslations("admin.nav")]);
  const isAdmin = isAdminRole(user.role);
  const isStaff = isStaffOrAbove(user.role);
  const isStaffOnly = isStaffOnlyRole(user.role);

  const primary = [
    ["dashboard", "/"] as const,
    ...(isStaff ? ([["verifyPass", "/verify-pass"]] as const) : []),
    ...(isAdmin ? ([["paymentCheck", "/payment-check"]] as const) : []),
    ...(!isAdmin ? ([["buy", "/buy"]] as const) : []),
    ["account", "/account"] as const,
  ];

  const overflow = [
    ...(isStaff && !isAdmin ? ([["paymentCheck", "/payment-check", tNav("paymentCheck")]] as const) : []),
    ...(isStaff ? ([["setPersonType", "/set-person-type", tNav("setPersonType")]] as const) : []),
    ...(isAdmin ? ([["admin", "/admin", tNav("admin")]] as const) : []),
    ...(isStaffOnly ? ([["guideStaff", "/navod-staff", tNav("guideStaff")]] as const) : []),
  ];
  const adminSections = isAdmin ? visibleAdminSections(isRootRole(user.role)) : [];
  const overflowHrefs = [...overflow.map(([, href]) => href), ...adminSections.map(([, href]) => href)];

  return (
    <nav className="tab-bar fixed inset-x-0 bottom-0 z-40 flex sm:hidden">
      <div className="mx-auto flex w-full max-w-6xl">
        {primary.map(([key, href]) => {
          const Icon = NAV_ICONS[key];
          return (
            <BottomTabLink
              key={href}
              href={href}
              icon={<Icon className="h-5 w-5" />}
              label={key === "account" ? tNav("accountTab") : tNav(key)}
            />
          );
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
                  const Icon = ADMIN_ICONS[key];
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
