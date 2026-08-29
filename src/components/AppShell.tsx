import { Form, useParams } from "react-router";
import { useTranslations, Trans } from "@/i18n/translations";
import { defaultLocale, isLocale } from "@/i18n/routing";
import type { SessionUser } from "@/lib/session.server";
import { AppTopBar } from "./AppTopBar";
import { AppSidebar } from "./AppSidebar";
import { BottomTabBar } from "./BottomTabBar";
import { StatusBanner } from "./StatusBanner";

export type { SessionUser };

/**
 * Page chrome shared by every locale-prefixed route. Mobile (below sm) gets
 * a slim top strip (AppTopBar: brand, locale, logout/login) plus a fixed
 * bottom tab bar (BottomTabBar) for primary nav; desktop (sm+) gets a fixed
 * left nav panel instead (AppSidebar) — all render unconditionally and
 * switch visibility via CSS only, so there's no layout flash or client
 * state involved in picking one over the other.
 */
export function AppShell({
  user,
  logbookEnabled,
  impersonator,
  children,
}: {
  user: SessionUser | null;
  logbookEnabled: boolean;
  /** Set only while a ROOT user is impersonating `user` — see adminImpersonateAction. Renders a persistent banner so it's never lost track of, since the rest of the chrome (sidebar, avatar, ...) shows the impersonated account, not ROOT's own. */
  impersonator?: { name: string | null; email: string } | null;
  children: React.ReactNode;
}) {
  const t = useTranslations("testBanner");
  const tBanners = useTranslations("banners");
  const { locale: paramLocale } = useParams();
  const locale = isLocale(paramLocale) ? paramLocale : defaultLocale;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col">
      <div className="flex flex-col gap-1.5 px-3 pt-1.5 sm:gap-2 sm:px-6 sm:pt-6">
        {impersonator && (
          <StatusBanner tone="danger" dense>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {tBanners("impersonating", {
                  target: user?.name || user?.email || "",
                  actor: impersonator.name || impersonator.email,
                })}
              </span>
              <Form method="post" action={`/${locale}/stop-impersonation`}>
                <button type="submit" className="btn btn-secondary !px-2 !py-1 text-xs">
                  {tBanners("stopImpersonating")}
                </button>
              </Form>
            </div>
          </StatusBanner>
        )}
        <StatusBanner tone="warning" dense>
          <div className="text-center">
            <Trans
              t={t}
              i18nKey="message"
              components={{
                email: <a href="mailto:aplikace@stenatisnov.cz" className="underline" />,
                phone: <a href="tel:+420774983511" className="underline" />,
              }}
            />
          </div>
        </StatusBanner>
      </div>
      <div className="flex w-full flex-1">
        <AppSidebar user={user} logbookEnabled={logbookEnabled} />
        <div className="flex w-full min-w-0 flex-1 flex-col">
          <AppTopBar user={user} />
          <main className="app-main w-full flex-1 px-3 pb-6 sm:px-6 sm:py-6">{children}</main>
        </div>
      </div>
      <BottomTabBar user={user} logbookEnabled={logbookEnabled} />
    </div>
  );
}
