import { createCookieSessionStorage, redirect } from "react-router";
import type { NavStyle, Role, UserStatus } from "@prisma/client";
import { getPrisma } from "./db.server";
import { getEnv } from "./env";
import { isAdminRole, isRootRole, isStaffOrAbove } from "./roles";

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  role: Role;
  status: UserStatus;
  suspended: boolean;
  /** No longer read anywhere — kept on the type since it still flows through the session untouched. */
  navStyle: NavStyle;
};

/**
 * Session only ever stores the user id — role/status/suspended are re-read
 * from the DB on every request (see `getSessionUser`) so an admin's change
 * takes effect immediately, without forcing the member to log out. Same
 * behavior as the old NextAuth `jwt` callback's per-request DB re-read.
 */
function getSessionStorage() {
  const env = getEnv();
  return createCookieSessionStorage({
    cookie: {
      name: "stena_session",
      httpOnly: true,
      sameSite: "lax",
      secure: (env.APP_URL ?? "").startsWith("https://"),
      secrets: [env.AUTH_SECRET ?? "dev-secret-change-me"],
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    },
  });
}

export async function getUserId(request: Request): Promise<string | null> {
  const storage = getSessionStorage();
  const session = await storage.getSession(request.headers.get("Cookie"));
  return (session.get("userId") as string | undefined) ?? null;
}

export async function commitUserSession(userId: string, request: Request): Promise<string> {
  const storage = getSessionStorage();
  const session = await storage.getSession(request.headers.get("Cookie"));
  session.set("userId", userId);
  return storage.commitSession(session);
}

/** Throws a redirect with the session cookie set. */
export async function createUserSession(userId: string, redirectTo: string, request: Request): Promise<never> {
  const cookie = await commitUserSession(userId, request);
  throw redirect(redirectTo, { headers: { "Set-Cookie": cookie } });
}

export async function destroySession(redirectTo: string, request: Request): Promise<never> {
  const storage = getSessionStorage();
  const session = await storage.getSession(request.headers.get("Cookie"));
  throw redirect(redirectTo, { headers: { "Set-Cookie": await storage.destroySession(session) } });
}

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const userId = await getUserId(request);
  if (!userId) return null;
  const prisma = await getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    suspended: user.suspended,
    navStyle: user.navStyle,
  };
}

export async function requireSession(request: Request, locale: string): Promise<SessionUser> {
  const user = await getSessionUser(request);
  if (!user) throw redirect(`/${locale}/login`);
  return user;
}

export async function requireAdmin(request: Request, locale: string): Promise<SessionUser> {
  const user = await requireSession(request, locale);
  if (!isAdminRole(user.role)) throw redirect(`/${locale}`);
  return user;
}

/** Gates pages viewable by STAFF and above (e.g. the payment-control page) — narrower than requireAdmin, which excludes STAFF. */
export async function requireStaffOrAbove(request: Request, locale: string): Promise<SessionUser> {
  const user = await requireSession(request, locale);
  if (!isStaffOrAbove(user.role)) throw redirect(`/${locale}`);
  return user;
}

/** Gates the root-only sections (settings, data, logs) within the admin area. */
export async function requireRoot(request: Request, locale: string): Promise<SessionUser> {
  const user = await requireSession(request, locale);
  if (!isRootRole(user.role)) throw redirect(`/${locale}/admin`);
  return user;
}

/** Gate/purchase eligibility unrelated to credits or schedule — just account state. */
export function canUseApp(user: { status: string; suspended: boolean }): { ok: boolean; reason?: "pending" | "suspended" } {
  if (user.suspended) return { ok: false, reason: "suspended" };
  if (user.status !== "APPROVED") return { ok: false, reason: "pending" };
  return { ok: true };
}
