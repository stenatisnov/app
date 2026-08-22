import { useTranslations } from "@/i18n/translations";
import { BottomTabLink } from "./BottomTabLink";
import { MoreSheet } from "./MoreSheet";
import { NavLink } from "./NavLink";
import { NAV_ICONS, ADMIN_ICONS } from "./NavIcons";
import { visibleAdminSections } from "@/lib/admin-nav";
import { isAdminRole, isRootRole, isStaffOnlyRole } from "@/lib/roles";
import type { SessionUser } from "@/lib/session.server";

type PrimaryItem = readonly [key: keyof typeof NAV_ICONS, href: string];
type OverflowItem = readonly [key: string, href: string, label: string];

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
 * wrapping pill-row. 3-5 primary tabs (role-dependent) plus a "More" sheet
 * for secondary/role-specific items. Desktop keeps AppSidebar, unchanged.
 * Anonymous visitors get no bar at all — Login/Register live in AppTopBar.
 */
export function BottomTabBar({ user, logbookEnabled }: { user: SessionUser | null; logbookEnabled: boolean }) {
  const tNav = useTranslations("nav");
  const tAdmin = useTranslations("admin");
  const tAdminNav = (key: string) => tAdmin(`nav.${key}`);

  if (!user) return null;

  const isAdmin = isAdminRole(user.role);
  const isStaffOnly = isStaffOnlyRole(user.role);

  let primary: PrimaryItem[];
  let overflow: OverflowItem[];

  if (isStaffOnly) {
    // Door/desk work (verify a pass, check payments, set a person type) is
    // what STAFF reaches for constantly — keep exactly those 3 primary.
    // Their own account, buying credits, and the staff guide are much
    // lower-frequency for someone working a shift, so those move to More.
    primary = [
      ["verifyPass", "/verify-pass"],
      ["paymentCheck", "/payment-check"],
      ["setPersonType", "/set-person-type"],
    ];
    overflow = [
      ["dashboard", "/", tNav("dashboard")],
      ["buy", "/buy", tNav("buy")],
      ["account", "/account", tNav("account")],
      ["guideStaff", "/navod-staff", tNav("guideStaff")],
    ];
  } else if (isAdmin) {
    primary = [
      ["dashboard", "/"],
      ["verifyPass", "/verify-pass"],
      ["paymentCheck", "/payment-check"],
      ["account", "/account"],
    ];
    overflow = [
      ["setPersonType", "/set-person-type", tNav("setPersonType")],
      ["admin", "/admin", tNav("admin")],
    ];
  } else {
    primary = [
      ["dashboard", "/"],
      ["buy", "/buy"],
      ["account", "/account"],
    ];
    overflow = [];
  }

  if (logbookEnabled) {
    overflow = [...overflow, ["logbook", "/logbook", tNav("logbook")]];
  }

  const adminSections = isAdmin ? visibleAdminSections(isRootRole(user.role)) : [];
  const overflowHrefs = [...overflow.map(([, href]) => href), ...adminSections.map(([, href]) => href)];

  return (
    <nav className="tab-bar fixed inset-x-0 bottom-0 z-40 flex sm:hidden">
      <div className="mx-auto flex w-full max-w-6xl">
        {primary.map(([key, href]) => {
          const Icon = NAV_ICONS[key];
          return <BottomTabLink key={href} href={href} icon={<Icon className="h-5 w-5" />} label={primaryLabel(key, tNav)} />;
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
