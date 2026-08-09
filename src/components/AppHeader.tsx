import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { logoutAction } from "@/app/actions";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { MobileMenu } from "./MobileMenu";
import { BrandLink } from "./BrandLink";
import { UserAvatar } from "./UserAvatar";
import { NAV_ICONS } from "./NavIcons";
import { isAdminRole, isStaffOrAbove } from "@/lib/roles";
import type { SessionUser } from "./AppShell";

/** Mobile-only (below sm) top bar — desktop uses AppSidebar instead. */
export async function AppHeader({ user }: { user: SessionUser }) {
  const [tApp, tNav] = await Promise.all([getTranslations("app"), getTranslations("nav")]);
  const accountLabel = user ? user.name || user.email : "";

  const links = user
    ? ([
        ["account", accountLabel, "/account"],
        ["dashboard", tNav("dashboard"), "/"],
        ...(isStaffOrAbove(user.role)
          ? ([["verifyPass", tNav("verifyPass"), "/verify-pass"]] as const)
          : []),
        ...(isStaffOrAbove(user.role) ? [] : [["buy", tNav("buy"), "/buy"] as const]),
        ...(isStaffOrAbove(user.role)
          ? ([["paymentCheck", tNav("paymentCheck"), "/payment-check"]] as const)
          : []),
        ...(isAdminRole(user.role) ? ([["admin", tNav("admin"), "/admin"]] as const) : []),
        ...(isStaffOrAbove(user.role)
          ? ([["guideStaff", tNav("guideStaff"), "/navod-staff"]] as const)
          : []),
      ] as const)
    : ([
        ["login", tNav("login"), "/login"],
        ["register", tNav("register"), "/register"],
      ] as const);

  return (
    <header className="flex w-full items-center justify-between gap-2 px-3 py-2 sm:hidden">
      <BrandLink brand={tApp("name")} />

      <MobileMenu label={tNav("menu")}>
        {links.map(([key, label, href]) => {
          const Icon = NAV_ICONS[key as keyof typeof NAV_ICONS];
          return (
            <Link
              key={href}
              className={`btn ${key === "dashboard" || key === "login" ? "btn-primary" : "btn-secondary"} w-full !justify-start gap-2 !px-3 !py-2 text-sm`}
              href={href}
            >
              {key === "account" ? <UserAvatar name={label} /> : Icon && <Icon className="h-4 w-4 shrink-0" />}
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
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
