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
