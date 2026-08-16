import { Google } from "arctic";
import { redirect } from "react-router";
import { getEnv } from "./env";
import { requestAppUrl } from "./request-url";

/** Returns `null` when Google OAuth isn't configured — same "conditionally offered" behavior as the old NextAuth setup, which only pushed the Google provider into its list when both env vars were set. */
export function getGoogleClient(request: Request): Google | null {
  const env = getEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  const redirectUri = `${requestAppUrl(request)}/api/auth/google/callback`;
  return new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri);
}

const STATE_COOKIE = "google_oauth_state";

export function stateCookieHeader(state: string): string {
  return `${STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`;
}

export function clearStateCookieHeader(): string {
  return `${STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readStateCookie(request: Request): string | null {
  const cookie = request.headers.get("Cookie") ?? "";
  const match = cookie.match(new RegExp(`${STATE_COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}

export function googleNotConfigured(locale: string): never {
  throw redirect(`/${locale}/login`);
}
