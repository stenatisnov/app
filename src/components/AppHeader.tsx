import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { logoutAction } from "@/app/actions";
import { LocaleSwitcher } from "./LocaleSwitcher";
import type { SessionUser } from "./AppShell";

export async function AppHeader({ user }: { user: SessionUser }) {
  const [tApp, tNav] = await Promise.all([getTranslations("app"), getTranslations("nav")]);

  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="font-semibold text-brand">
          {tApp("name")}
        </Link>

        <nav className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <Link href="/">{tNav("dashboard")}</Link>
              <Link href="/buy">{tNav("buy")}</Link>
              <Link href="/account">{tNav("account")}</Link>
              {user.role === "ADMIN" && <Link href="/admin">{tNav("admin")}</Link>}
              <form action={logoutAction}>
                <button type="submit" className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
                  {tNav("logout")}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login">{tNav("login")}</Link>
              <Link href="/register">{tNav("register")}</Link>
            </>
          )}
          <LocaleSwitcher />
        </nav>
      </div>
    </header>
  );
}
