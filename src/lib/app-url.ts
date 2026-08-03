import { headers } from "next/headers";

/** Public base URL from env, without a trailing slash. Falls back to local dev. */
export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Base URL derived from the incoming request (proxy-aware), so links point at
 * the actual host the user is on. Server-side only. Falls back to {@link appUrl}.
 */
export async function requestAppUrl(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || "https";
      return `${proto}://${host}`.replace(/\/+$/, "");
    }
  } catch {
    // headers() unavailable (e.g. outside a request scope) — fall through.
  }
  return appUrl();
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
