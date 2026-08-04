import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { logoutAction } from "@/app/actions";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { BrandLink } from "./BrandLink";
import type { SessionUser } from "./AppShell";

/** Desktop-only (sm+) fixed left nav panel — mobile keeps the top bar + hamburger in AppHeader. */
export async function AppSidebar({ user }: { user: SessionUser }) {
  const [tApp, tNav] = await Promise.all([getTranslations("app"), getTranslations("nav")]);

  const links = user
    ? ([
        [tNav("dashboard"), "/"],
        [tNav("buy"), "/buy"],
        [tNav("account"), "/account"],
        ...(user.role === "ADMIN" ? ([[tNav("admin"), "/admin"]] as const) : []),
      ] as const)
    : ([
        [tNav("login"), "/login"],
        [tNav("register"), "/register"],
      ] as const);

  return (
    <aside className="app-aside sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-[var(--line)] px-4 py-6 sm:flex">
      <BrandLink brand={tApp("name")} />

      <nav className="flex flex-col gap-1">
        {links.map(([label, href]) => (
          <Link key={href} href={href} className="btn btn-secondary w-full !justify-start !px-3 !py-2 text-sm">
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        {user && (
          <form action={logoutAction}>
            <button className="btn btn-secondary w-full !justify-start !px-3 !py-2 text-sm" type="submit">
              {tNav("logout")}
            </button>
          </form>
        )}
        <LocaleSwitcher />
      </div>
    </aside>
  );
}
