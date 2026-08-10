import { getTranslations } from "next-intl/server";
import { logoutAction } from "@/app/actions";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { MobileMenu } from "./MobileMenu";
import { BrandLink } from "./BrandLink";
import { UserAvatar } from "./UserAvatar";
import { NavLink } from "./NavLink";
import { NAV_ICONS } from "./NavIcons";
import { isAdminRole, isStaffOrAbove, isStaffOnlyRole } from "@/lib/roles";
import type { SessionUser } from "./AppShell";

/** Mobile-only (below sm) top bar — desktop uses AppSidebar instead. */
export async function AppHeader({ user }: { user: SessionUser }) {
  const [tApp, tNav] = await Promise.all([getTranslations("app"), getTranslations("nav")]);
  const accountLabel = user ? user.name || user.email : "";
  // Anonymous visitors (no stored preference yet) get the default too.
  const buttonStyle = !user || user.navStyle === "BUTTONS";

  const links = user
    ? ([
        ["account", accountLabel, "/account"],
        ["dashboard", tNav("dashboard"), "/"],
        ...(isAdminRole(user.role) ? [] : [["buy", tNav("buy"), "/buy"] as const]),
        ...(isStaffOrAbove(user.role)
          ? ([["verifyPass", tNav("verifyPass"), "/verify-pass"]] as const)
          : []),
        ...(isStaffOrAbove(user.role)
          ? ([["paymentCheck", tNav("paymentCheck"), "/payment-check"]] as const)
          : []),
        ...(isAdminRole(user.role) ? ([["admin", tNav("admin"), "/admin"]] as const) : []),
        ...(isStaffOnlyRole(user.role)
          ? ([["guideStaff", tNav("guideStaff"), "/navod-staff"]] as const)
          : []),
      ] as const)
    : ([
        ["login", tNav("login"), "/login"],
        ["register", tNav("register"), "/register"],
      ] as const);

  const linkItems = links.map(([key, label, href]) => {
    const Icon = NAV_ICONS[key as keyof typeof NAV_ICONS];
    return (
      <NavLink key={href} href={href} layout={buttonStyle ? "row" : "list"}>
        {key === "account" ? <UserAvatar name={label} /> : Icon && <Icon className="h-4 w-4 shrink-0" />}
        {key === "account" ? (
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span className="text-[0.65rem] font-medium text-[var(--muted)]">{tNav("account")}</span>
            <span className="truncate">{label}</span>
          </span>
        ) : (
          <span className="truncate">{label}</span>
        )}
      </NavLink>
    );
  });

  // Button style: top-level items shown directly as a wrapping button row,
  // same as the admin section's mobile nav (AdminNav) — no dropdown at all.
  if (buttonStyle) {
    return (
      <header className="flex w-full flex-col gap-2 px-3 py-2 sm:hidden">
        <div className="flex items-center justify-between gap-2">
          <BrandLink brand={tApp("name")} />
          <div className="flex items-center gap-1.5">
            <LocaleSwitcher />
            {user && (
              <form action={logoutAction}>
                <button
                  className="btn btn-secondary !px-2.5 !py-1.5 text-xs"
                  type="submit"
                  aria-label={tNav("logout")}
                  title={tNav("logout")}
                >
                  <NAV_ICONS.logout className="h-4 w-4 shrink-0" />
                </button>
              </form>
            )}
          </div>
        </div>
        <nav className="flex flex-wrap gap-1.5 text-sm">{linkItems}</nav>
      </header>
    );
  }

  return (
    <header className="flex w-full items-center justify-between gap-2 px-3 py-2 sm:hidden">
      <BrandLink brand={tApp("name")} />

      <MobileMenu label={tNav("menu")}>
        {linkItems}
        {user && (
          <form action={logoutAction}>
            <button className="btn btn-secondary w-full !justify-start gap-2 !px-3 !py-2 text-sm" type="submit">
              <NAV_ICONS.logout className="h-4 w-4 shrink-0" />
              {tNav("logout")}
            </button>
          </form>
        )}
        <div className="pt-1">
          <LocaleSwitcher />
        </div>
      </MobileMenu>
    </header>
  );
}
