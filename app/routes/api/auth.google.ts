import { redirect } from "react-router";
import type { Route } from "./+types/auth.google";
import { getGoogleClient, generateCodeVerifier, generateState, stateCookieHeader } from "@/lib/google-auth.server";
import { withLoadContext } from "@/lib/request-context.server";
import { defaultLocale } from "@/i18n/routing";

export const VERIFIER_COOKIE = "google_oauth_verifier";

export async function loader({ request, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const google = await getGoogleClient(request);
    if (!google) throw redirect(`/${defaultLocale}/login`);

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = await google.createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"]);

    throw redirect(url.toString(), {
      headers: [
        ["Set-Cookie", stateCookieHeader(state)],
        ["Set-Cookie", `${VERIFIER_COOKIE}=${codeVerifier}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`],
      ],
    });
  });
}
