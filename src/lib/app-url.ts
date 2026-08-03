/** Public base URL, without a trailing slash. Falls back to local dev. */
export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function guestPassUrl(token: string, locale = "cs"): string {
  return `${appUrl()}/${locale}/guest/${token}`;
}

export function loginUrl(locale = "cs"): string {
  return `${appUrl()}/${locale}/login`;
}
