import { redirect } from "react-router";
import type { Route } from "./+types/auth.google.callback";
import { getGoogleClient, readStateCookie, clearStateCookieHeader } from "@/lib/google-auth.server";
import { withLoadContext } from "@/lib/request-context.server";
import { commitUserSession } from "@/lib/session.server";
import { getPrisma } from "@/lib/db";
import { defaultLocale } from "@/i18n/routing";
import { VERIFIER_COOKIE } from "./auth.google";

type GoogleUserInfo = { sub: string; email: string; email_verified: boolean; name?: string; picture?: string };

function readCookie(request: Request, name: string): string | null {
  const match = request.headers.get("Cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

/**
 * Mirrors the old NextAuth `signIn` callback's Google-provider handling:
 * link to an existing user by email, or first-time-sign-in provision a
 * PENDING member (default group/person type) exactly like the registration
 * form would — except birth date, which Google's profile doesn't carry
 * (see `/complete-profile`) and age-gating/registration emails wait for.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const storedState = readStateCookie(request);
    const codeVerifier = readCookie(request, VERIFIER_COOKIE);

    const google = await getGoogleClient(request);
    if (!google || !code || !state || !storedState || state !== storedState || !codeVerifier) {
      throw redirect(`/${defaultLocale}/login?error=invalid`);
    }

    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.accessToken()}` },
    });
    if (!res.ok) throw redirect(`/${defaultLocale}/login?error=invalid`);
    const googleUser = (await res.json()) as GoogleUserInfo;
    // Google can (rarely) report an unverified address on the userinfo
    // response — trusting it blindly would let someone register/link an
    // account under an email they don't actually control. Bounce back to
    // login instead of silently marking it verified in that case.
    if (!googleUser.email_verified) {
      throw redirect(`/${defaultLocale}/login?error=invalid`);
    }

    const prisma = await getPrisma();
    const email = googleUser.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });

    let userId: string;
    // No `passwordHash` is ever set on a Google-created account (see below),
    // so a MEMBER with both `passwordHash` and `birthDate` still null can
    // only be an account that started via Google and never finished the
    // birth-date step — route it back there instead of straight to `/`,
    // on every login until it's completed (not just the first one), so an
    // abandoned sign-up doesn't quietly slip through the age gate later.
    let needsProfile: boolean;
    if (existing) {
      userId = existing.id;
      needsProfile = existing.role === "MEMBER" && existing.passwordHash === null && existing.birthDate === null;
    } else {
      const [defaultGroup, defaultPersonType] = await Promise.all([
        prisma.group.findFirst({ where: { isDefault: true } }),
        prisma.personType.findFirst({ where: { isDefault: true }, orderBy: { createdAt: "asc" } }),
      ]);

      // `status` starts PENDING regardless of the registration auto-approve
      // setting — the real status (which depends on age) is only decided
      // once `/complete-profile` reports a birth date.
      const created = await prisma.user.create({
        data: {
          email,
          name: googleUser.name,
          image: googleUser.picture,
          status: "PENDING",
          role: "MEMBER",
          personTypeId: defaultPersonType?.id,
          emailVerified: new Date(),
        },
      });
      if (defaultGroup) {
        await prisma.userGroup.create({ data: { userId: created.id, groupId: defaultGroup.id } });
      }
      userId = created.id;
      needsProfile = true;
    }

    const sessionCookie = await commitUserSession(userId, request);
    throw redirect(needsProfile ? `/${defaultLocale}/complete-profile` : `/${defaultLocale}`, {
      headers: [
        ["Set-Cookie", sessionCookie],
        ["Set-Cookie", clearStateCookieHeader()],
      ],
    });
  });
}
