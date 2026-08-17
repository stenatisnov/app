import { redirect } from "react-router";
import { getGoogleOAuthSettings } from "./settings";
import { requestAppUrl } from "./request-url";

/**
 * Hand-rolled OAuth 2.0 Authorization Code + PKCE flow against Google's
 * endpoints — replaces the `arctic` package (and its `@oslojs/*`
 * dependencies, same author), which npm now marks "no longer supported"
 * with no maintained successor, even at its latest version. The whole flow
 * is three well-documented Google endpoints/params; not worth carrying a
 * dependency (with its own upstream-abandonment risk) for, especially
 * since this codebase already prefers small hand-rolled implementations of
 * well-known protocols over library dependencies for this kind of thing
 * (see `session.server.ts`'s cookie auth instead of Auth.js).
 */

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

export function generateCodeVerifier(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

async function codeChallengeFromVerifier(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export type GoogleOAuthClient = {
  createAuthorizationURL(state: string, codeVerifier: string, scopes: string[]): Promise<URL>;
  validateAuthorizationCode(code: string, codeVerifier: string): Promise<{ accessToken(): string }>;
};

function createGoogleOAuthClient(clientId: string, clientSecret: string, redirectUri: string): GoogleOAuthClient {
  return {
    async createAuthorizationURL(state, codeVerifier, scopes) {
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", scopes.join(" "));
      url.searchParams.set("state", state);
      url.searchParams.set("code_challenge", await codeChallengeFromVerifier(codeVerifier));
      url.searchParams.set("code_challenge_method", "S256");
      return url;
    },
    async validateAuthorizationCode(code, codeVerifier) {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
          code_verifier: codeVerifier,
        }),
      });
      if (!res.ok) throw new Error(`GOOGLE_TOKEN_EXCHANGE_FAILED_${res.status}`);
      const tokenResponse = (await res.json()) as { access_token: string };
      return { accessToken: () => tokenResponse.access_token };
    },
  };
}

/** Returns `null` when Google OAuth isn't enabled/configured (see `isGoogleOAuthEnabled`, used by the login/register pages to hide the button in that case). */
export async function getGoogleClient(request: Request): Promise<GoogleOAuthClient | null> {
  const settings = await getGoogleOAuthSettings();
  if (!settings.enabled || !settings.clientId || !settings.clientSecret) return null;
  const redirectUri = `${requestAppUrl(request)}/api/auth/google/callback`;
  return createGoogleOAuthClient(settings.clientId, settings.clientSecret, redirectUri);
}

/** Cheap "should the login/register pages show the Google button" check — same conditions as `getGoogleClient`, without needing a `Request`. */
export async function isGoogleOAuthEnabled(): Promise<boolean> {
  const settings = await getGoogleOAuthSettings();
  return settings.enabled && Boolean(settings.clientId) && Boolean(settings.clientSecret);
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
