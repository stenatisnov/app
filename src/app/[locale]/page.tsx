import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { formatAppDateTime, isWithinWindows } from "@/lib/time";
import { OpenGateButton } from "@/components/OpenGateButton";
import { StatusBanner } from "@/components/StatusBanner";
import { CurrentTime } from "@/components/CurrentTime";
import { LoginCard } from "@/components/LoginCard";
import { Link } from "@/i18n/navigation";

/**
 * Signed-out visitors see the login form; members see their dashboard.
 * Deliberately a single async function rather than an early return plus a
 * nested async sub-component: nesting a second async Server Component here
 * leaves an unresolved Suspense placeholder in the streamed HTML under
 * Workers/OpenNext (the D1 variant) — the data reaches the client in the
 * RSC payload, but the DOM never gets patched. This straight-line await
 * chain avoids that entirely.
 */
export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    const { error } = await searchParams;
    const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    return <LoginCard error={error} googleEnabled={googleEnabled} />;
  }

  const t = await getTranslations("dashboard");
  const tBanners = await getTranslations("banners");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      groups: { include: { group: { include: { windows: true } } } },
    },
  });
  if (!user) return null;

  const now = new Date();
  const isAdmin = user.role === "ADMIN";
  const activePass = isAdmin
    ? null
    : await prisma.userAccessPass.findFirst({
        where: { userId: user.id, validFrom: { lte: now }, validTo: { gte: now } },
        orderBy: { validTo: "desc" },
      });
  const inWindow = isAdmin || user.groups.some(({ group }) => isWithinWindows(group.windows, group.is24_7));
  const inCooldown = Boolean(user.cooldownUntil && user.cooldownUntil > now);
  const hasCredits = isAdmin || Boolean(activePass) || user.credits >= 1;

  const blocked = user.status !== "APPROVED" || user.suspended;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>
        <CurrentTime />
      </div>

      {user.status === "PENDING" && <StatusBanner tone="warning">{tBanners("pending")}</StatusBanner>}
      {user.status === "REJECTED" && <StatusBanner tone="danger">{tBanners("suspended")}</StatusBanner>}
      {user.suspended && <StatusBanner tone="danger">{tBanners("suspended")}</StatusBanner>}
      {!blocked && !inWindow && <StatusBanner tone="warning">{tBanners("outsideHours")}</StatusBanner>}
      {!blocked && !hasCredits && <StatusBanner tone="warning">{tBanners("noCredits")}</StatusBanner>}
      {!blocked && inCooldown && <StatusBanner tone="info">{tBanners("cooldown")}</StatusBanner>}

      <div className="card text-center">
        <p className="text-sm text-[var(--muted)]">{t("creditsLabel")}</p>
        <p className="credits-hero">{user.credits}</p>
        {activePass && (
          <p className="mt-2 text-sm text-[var(--ok)]">
            {t("activePass")} — {t("activePassUntil", { date: formatAppDateTime(activePass.validTo) })}
          </p>
        )}
      </div>

      <OpenGateButton disabled={blocked || !inWindow || (!hasCredits && !isAdmin) || inCooldown} />

      {!isAdmin && !hasCredits && (
        <Link href="/buy" className="gate-hint text-center text-[var(--brand)] underline">
          {t("buyMore")}
        </Link>
      )}
    </div>
  );
}
