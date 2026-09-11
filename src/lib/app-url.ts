/**
 * Public base URL from env, without a trailing slash. Falls back to local dev.
 * Safe to import from client components (no server-only deps). For a
 * request/browser-derived base use `requestAppUrl` (server) or
 * `window.location.origin` (client).
 *
 * `process` is reached through `globalThis` with optional chaining on purpose,
 * not defensively-but-redundantly: the Vite client **build** statically
 * rewrites a bare `process.env` to `{}` (so this degrades to the fallback
 * there), but the client environment in `vite dev` is served untransformed —
 * a bare `process` reference is a ReferenceError in the browser. Client
 * components (GuestPassCard, ChildGroupCard) call this from a `useState`
 * initializer precisely to match the SSR markup before their mount effect
 * swaps in `window.location.origin`, so that throw took the whole route down
 * in dev. Server-side nothing changes: workerd's `nodejs_compat` supplies
 * `process.env` as a real global.
 */
export function appUrl(): string {
  return (globalThis.process?.env?.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function guestPassPath(token: string, locale = "cs"): string {
  return `/${locale}/guest/${token}`;
}

export function childGroupJoinPath(token: string, locale = "cs"): string {
  return `/${locale}/join/${token}`;
}

export function loginPath(locale = "cs"): string {
  return `/${locale}/login`;
}

export function verifyEmailPath(token: string, locale = "cs"): string {
  return `/${locale}/verify-email?token=${token}`;
}

export function resetPasswordPath(token: string, locale = "cs"): string {
  return `/${locale}/reset-password?token=${token}`;
}

export function adminUsersPath(locale = "cs"): string {
  return `/${locale}/admin/users`;
}

export function adminPaymentsPath(locale = "cs"): string {
  return `/${locale}/admin/payments`;
}

export function guestPassUrl(token: string, locale = "cs", base = appUrl()): string {
  return `${base}${guestPassPath(token, locale)}`;
}

export function childGroupJoinUrl(token: string, locale = "cs", base = appUrl()): string {
  return `${base}${childGroupJoinPath(token, locale)}`;
}

export function loginUrl(locale = "cs", base = appUrl()): string {
  return `${base}${loginPath(locale)}`;
}

export function verifyEmailUrl(token: string, locale = "cs", base = appUrl()): string {
  return `${base}${verifyEmailPath(token, locale)}`;
}

export function resetPasswordUrl(token: string, locale = "cs", base = appUrl()): string {
  return `${base}${resetPasswordPath(token, locale)}`;
}

export function adminUsersUrl(locale = "cs", base = appUrl()): string {
  return `${base}${adminUsersPath(locale)}`;
}

export function adminPaymentsUrl(locale = "cs", base = appUrl()): string {
  return `${base}${adminPaymentsPath(locale)}`;
}
