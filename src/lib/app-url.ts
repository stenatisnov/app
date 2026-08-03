/**
 * Public base URL from env, without a trailing slash. Falls back to local dev.
 * Safe to import from client components (no server-only deps). For a
 * request/browser-derived base use `requestAppUrl` (server) or
 * `window.location.origin` (client).
 */
export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function guestPassPath(token: string, locale = "cs"): string {
  return `/${locale}/guest/${token}`;
}

export function loginPath(locale = "cs"): string {
  return `/${locale}/login`;
}

export function guestPassUrl(token: string, locale = "cs", base = appUrl()): string {
  return `${base}${guestPassPath(token, locale)}`;
}

export function loginUrl(locale = "cs", base = appUrl()): string {
  return `${base}${loginPath(locale)}`;
}
