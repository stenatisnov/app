import type { Role, UserStatus } from "@prisma/client";
import { AppHeader } from "./AppHeader";

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  role: Role;
  status: UserStatus;
  suspended: boolean;
} | null;

/** Page chrome shared by every locale-prefixed route: header/nav + centered content column. */
export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col">
      <AppHeader user={user} />
      <main className="app-main w-full flex-1 space-y-4 px-3 pb-6 sm:px-4">{children}</main>
    </div>
  );
}
