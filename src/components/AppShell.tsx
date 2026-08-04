import type { Role, UserStatus } from "@prisma/client";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  role: Role;
  status: UserStatus;
  suspended: boolean;
} | null;

/**
 * Page chrome shared by every locale-prefixed route. Mobile (below sm) gets
 * a top bar with a hamburger dropdown (AppHeader); desktop (sm+) gets a
 * fixed left nav panel instead (AppSidebar) — both render unconditionally
 * and switch visibility via CSS only, so there's no layout flash or client
 * state involved in picking one over the other.
 */
export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl">
      <AppSidebar user={user} />
      <div className="flex w-full min-w-0 flex-1 flex-col">
        <AppHeader user={user} />
        <main className="app-main w-full flex-1 space-y-4 px-3 pb-6 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
