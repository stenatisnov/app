import { Form, useParams } from "react-router";
import { useTranslations } from "@/i18n/translations";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { BrandLink } from "./BrandLink";
import { NAV_ICONS } from "./NavIcons";
import { Link } from "@/i18n/navigation";
import { defaultLocale, isLocale } from "@/i18n/routing";
import type { SessionUser } from "@/lib/session.server";

/**
 * Mobile-only (below sm) top strip — brand, locale switcher, and
 * logout/login/register. Primary navigation lives in BottomTabBar instead
 * (desktop keeps AppSidebar for everything, unchanged).
 */
export function AppTopBar({ user }: { user: SessionUser | null }) {
  const tApp = useTranslations("app");
  const tNav = useTranslations("nav");
  const { locale: paramLocale } = useParams();
  const locale = isLocale(paramLocale) ? paramLocale : defaultLocale;

  return (
    <header className="flex w-full items-center justify-between gap-2 px-3 py-2 sm:hidden">
      <BrandLink brand={tApp("name")} />
      <div className="flex items-center gap-1.5">
        <LocaleSwitcher />
        {user ? (
          <Form method="post" action={`/${locale}/logout`}>
            <button
              className="btn btn-secondary !px-2.5 !py-1.5 text-xs"
              type="submit"
              aria-label={tNav("logout")}
              title={tNav("logout")}
            >
              <NAV_ICONS.logout className="h-4 w-4 shrink-0" />
            </button>
          </Form>
        ) : (
          <>
            <Link href="/login" className="btn btn-secondary !px-2.5 !py-1.5 text-xs">
              {tNav("login")}
            </Link>
            <Link href="/register" className="btn btn-primary !px-2.5 !py-1.5 text-xs">
              {tNav("register")}
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
