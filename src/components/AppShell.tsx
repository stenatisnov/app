import type { NavStyle, Role, UserStatus } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";
import { StatusBanner } from "./StatusBanner";

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  role: Role;
  status: UserStatus;
  suspended: boolean;
  navStyle: NavStyle;
} | null;

/**
 * Page chrome shared by every locale-prefixed route. Mobile (below sm) gets
 * a top bar with a hamburger dropdown (AppHeader); desktop (sm+) gets a
 * fixed left nav panel instead (AppSidebar) — both render unconditionally
 * and switch visibility via CSS only, so there's no layout flash or client
 * state involved in picking one over the other.
 */
export async function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const t = await getTranslations("testBanner");

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col">
      <div className="px-3 pt-2 sm:px-6 sm:pt-6">
        <StatusBanner tone="warning">
          {t.rich("message", {
            email: (chunks) => (
              <a href="mailto:admin@stenatisnov.app" className="underline">
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
          <AppHeader user={user} />
          <main className="app-main w-full flex-1 space-y-4 px-3 pb-6 sm:px-6 sm:py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
