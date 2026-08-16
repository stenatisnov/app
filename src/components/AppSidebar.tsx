import { Form, useParams } from "react-router";
import { useTranslations } from "@/i18n/translations";
import { Link } from "@/i18n/navigation";
import { defaultLocale, isLocale } from "@/i18n/routing";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { BrandLink } from "./BrandLink";
import { UserAvatar } from "./UserAvatar";
import { NAV_ICONS, ADMIN_ICONS } from "./NavIcons";
import { visibleAdminSections } from "@/lib/admin-nav";
import { isRootRole, isAdminRole, isStaffOrAbove, isStaffOnlyRole } from "@/lib/roles";
import type { SessionUser } from "@/lib/session.server";

/** Desktop-only (sm+) fixed left nav panel — mobile keeps a slim top bar (AppTopBar) plus a fixed bottom tab bar (BottomTabBar) instead. */
export function AppSidebar({ user }: { user: SessionUser | null }) {
  const tApp = useTranslations("app");
  const tNav = useTranslations("nav");
  const tAdmin = useTranslations("admin");
  const tAdminNav = (key: string) => tAdmin(`nav.${key}`);
  const { locale: paramLocale } = useParams();
  const locale = isLocale(paramLocale) ? paramLocale : defaultLocale;

  const isAdmin = isAdminRole(user?.role);
  const adminSections = visibleAdminSections(isRootRole(user?.role));
  const accountLabel = user ? user.name || user.email : "";

  const links = user
    ? ([
        ["account", accountLabel, "/account"],
        ["dashboard", tNav("dashboard"), "/"],
        ...(isAdminRole(user?.role) ? [] : [["buy", tNav("buy"), "/buy"] as const]),
        ...(isStaffOrAbove(user?.role)
          ? ([["verifyPass", tNav("verifyPass"), "/verify-pass"]] as const)
          : []),
        ...(isStaffOrAbove(user?.role)
          ? ([["paymentCheck", tNav("paymentCheck"), "/payment-check"]] as const)
          : []),
        ...(isStaffOrAbove(user?.role)
          ? ([["setPersonType", tNav("setPersonType"), "/set-person-type"]] as const)
          : []),
        ...(isAdmin ? ([["admin", tNav("admin"), "/admin"]] as const) : []),
        ...(isStaffOnlyRole(user?.role)
          ? ([["guideStaff", tNav("guideStaff"), "/navod-staff"]] as const)
          : []),
      ] as const)
    : ([
        ["login", tNav("login"), "/login"],
        ["register", tNav("register"), "/register"],
      ] as const);

  return (
    <aside className="app-aside sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-[var(--line)] px-4 py-6 sm:flex">
      <BrandLink brand={tApp("name")} wrap />

      <nav className="flex flex-col gap-1">
        {links.map(([key, label, href]) => {
          const Icon = NAV_ICONS[key as keyof typeof NAV_ICONS];
          return (
            <Link key={href} href={href} className="btn btn-secondary w-full !justify-start gap-2 !px-3 !py-2 text-sm">
              {key === "account" ? <UserAvatar name={label} /> : Icon && <Icon className="h-4 w-4 shrink-0" />}
              {key === "account" ? (
                <span className="flex min-w-0 flex-col items-start leading-tight">
                  <span className="text-[0.65rem] font-medium text-[var(--muted)]">{tNav("account")}</span>
                  <span className="truncate">{label}</span>
                </span>
              ) : (
                <span className="truncate">{label}</span>
              )}
            </Link>
          );
        })}
        {isAdmin && (
          <div className="ml-3 flex flex-col gap-1 border-l border-[var(--line)] pl-2">
            {adminSections.map(([key, href]) => {
              const Icon = ADMIN_ICONS[key];
              return (
                <Link
                  key={href}
                  href={href}
                  className="btn btn-secondary w-full !justify-start gap-2 !px-3 !py-1.5 text-xs"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{tAdminNav(key)}</span>
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        {user && (
          <Form method="post" action={`/${locale}/logout`}>
            <button className="btn btn-secondary w-full !justify-start gap-2 !px-3 !py-2 text-sm" type="submit">
              <NAV_ICONS.logout className="h-4 w-4 shrink-0" />
              {tNav("logout")}
            </button>
          </Form>
        )}
        <LocaleSwitcher />
      </div>
    </aside>
  );
}
