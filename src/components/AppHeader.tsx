import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { logoutAction } from "@/app/actions";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { MobileMenu } from "./MobileMenu";
import type { SessionUser } from "./AppShell";

function BrandLink({ brand }: { brand: string }) {
  return (
    <Link
      href="/"
      className="flex min-w-0 items-center gap-2 font-[family-name:var(--font-brand)] text-lg font-semibold tracking-tight text-[var(--brand-dark)] sm:gap-2.5 sm:text-xl"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt=""
        width={40}
        height={40}
        className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-[var(--line)] sm:h-10 sm:w-10"
      />
      <span className="min-w-0 truncate">{brand}</span>
    </Link>
  );
}

export async function AppHeader({ user }: { user: SessionUser }) {
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
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-4">
      <BrandLink brand={tApp("name")} />

      <nav className="hidden flex-wrap items-center gap-2 text-sm sm:flex">
        {links.map(([label, href]) => (
          <Link key={href} className="btn btn-secondary !px-3 !py-2" href={href}>
            {label}
          </Link>
        ))}
        {user && (
          <form action={logoutAction}>
            <button className="btn btn-secondary !px-3 !py-2" type="submit">
              {tNav("logout")}
            </button>
          </form>
        )}
        <LocaleSwitcher />
      </nav>

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
