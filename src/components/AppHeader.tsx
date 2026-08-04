import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { logoutAction } from "@/app/actions";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { MobileMenu } from "./MobileMenu";
import { BrandLink } from "./BrandLink";
import { isStaffRole } from "@/lib/roles";
import type { SessionUser } from "./AppShell";

/** Mobile-only (below sm) top bar — desktop uses AppSidebar instead. */
export async function AppHeader({ user }: { user: SessionUser }) {
  const [tApp, tNav] = await Promise.all([getTranslations("app"), getTranslations("nav")]);

  const links = user
    ? ([
        [tNav("dashboard"), "/"],
        [tNav("buy"), "/buy"],
        [tNav("account"), "/account"],
        ...(isStaffRole(user.role) ? ([[tNav("admin"), "/admin"]] as const) : []),
      ] as const)
    : ([
        [tNav("login"), "/login"],
        [tNav("register"), "/register"],
      ] as const);

  return (
    <header className="flex w-full items-center justify-between gap-2 px-3 py-2 sm:hidden">
      <BrandLink brand={tApp("name")} />

      <MobileMenu label={tNav("menu")}>
        {links.map(([label, href], i) => (
          <Link
            key={href}
            className={`btn ${i === 0 ? "btn-primary" : "btn-secondary"} w-full !justify-start !px-3 !py-2 text-sm`}
            href={href}
          >
            {label}
          </Link>
        ))}
        {user && (
          <form action={logoutAction}>
            <button className="btn btn-secondary w-full !justify-start !px-3 !py-2 text-sm" type="submit">
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
