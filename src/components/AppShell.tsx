import type { NavStyle, Role, UserStatus } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import { AppTopBar } from "./AppTopBar";
import { AppSidebar } from "./AppSidebar";
import { BottomTabBar } from "./BottomTabBar";
import { StatusBanner } from "./StatusBanner";

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  role: Role;
  status: UserStatus;
  suspended: boolean;
  /** No longer read anywhere — the mobile redesign replaced this per-user toggle with a fixed bottom tab bar. Kept on the type since it still flows through the session/JWT untouched. */
  navStyle: NavStyle;
} | null;

/**
 * Page chrome shared by every locale-prefixed route. Mobile (below sm) gets
 * a slim top strip (AppTopBar: brand, locale, logout/login) plus a fixed
 * bottom tab bar (BottomTabBar) for primary nav; desktop (sm+) gets a fixed
 * left nav panel instead (AppSidebar) — all render unconditionally and
 * switch visibility via CSS only, so there's no layout flash or client
 * state involved in picking one over the other.
 */
export async function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const t = await getTranslations("testBanner");

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col">
      <div className="px-3 pt-1.5 sm:px-6 sm:pt-6">
        <StatusBanner tone="warning" dense>
          {t.rich("message", {
            email: (chunks) => (
              <a href="mailto:aplikace@stenatisnov.cz" className="underline">
                {chunks}
              </a>
            ),
            phone: (chunks) => (
              <a href="tel:+420774983511" className="underline">
                {chunks}
              </a>
            ),
          })}
        </StatusBanner>
      </div>
      <div className="flex w-full flex-1">
        <AppSidebar user={user} />
        <div className="flex w-full min-w-0 flex-1 flex-col">
          <AppTopBar user={user} />
          <main className="app-main w-full flex-1 px-3 pb-6 sm:px-6 sm:py-6">{children}</main>
        </div>
      </div>
      <BottomTabBar user={user} />
    </div>
  );
}
