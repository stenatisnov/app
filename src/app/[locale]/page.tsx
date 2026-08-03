import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatAppDateTime, isWithinWindows } from "@/lib/time";
import { OpenGateButton } from "@/components/OpenGateButton";
import { StatusBanner } from "@/components/StatusBanner";
import { CurrentTime } from "@/components/CurrentTime";
import { Link } from "@/i18n/navigation";

export default async function DashboardPage() {
  const session = await requireSession();
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
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <CurrentTime />
      </div>

      {user.status === "PENDING" && <StatusBanner tone="warning">{tBanners("pending")}</StatusBanner>}
      {user.status === "REJECTED" && <StatusBanner tone="danger">{tBanners("suspended")}</StatusBanner>}
      {user.suspended && <StatusBanner tone="danger">{tBanners("suspended")}</StatusBanner>}
      {!blocked && !inWindow && <StatusBanner tone="warning">{tBanners("outsideHours")}</StatusBanner>}
      {!blocked && !hasCredits && <StatusBanner tone="warning">{tBanners("noCredits")}</StatusBanner>}
      {!blocked && inCooldown && <StatusBanner tone="info">{tBanners("cooldown")}</StatusBanner>}

      <div className="rounded-2xl border border-neutral-200 p-6 text-center dark:border-neutral-800">
        <p className="text-sm text-neutral-500">{t("creditsLabel")}</p>
        <p className="text-4xl font-bold">{user.credits}</p>
        {activePass && (
          <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
            {t("activePass")} — {t("activePassUntil", { date: formatAppDateTime(activePass.validTo) })}
          </p>
        )}
      </div>

      <OpenGateButton disabled={blocked || !inWindow || (!hasCredits && !isAdmin) || inCooldown} />

      {!isAdmin && !hasCredits && (
        <Link href="/buy" className="text-center text-brand underline">
          {t("buyMore")}
        </Link>
      )}
    </div>
  );
}
