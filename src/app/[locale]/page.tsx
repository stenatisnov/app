import { getTranslations } from "next-intl/server";
import { PaymentStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getPendingOrderCleanupSettingsStored, getQrPaymentSettings } from "@/lib/settings";
import { calculateAge, formatAppDateTime, toAppDateValue, isWithinWindows } from "@/lib/time";
import { hasFreeGateEntry } from "@/lib/roles";
import { OpenGateButton } from "@/components/OpenGateButton";
import { StatusBanner } from "@/components/StatusBanner";
import { LoginCard } from "@/components/LoginCard";
import { InstallPrompt } from "@/components/InstallPrompt";
import { QuickPaymentQr } from "@/components/QuickPaymentQr";
import { ResendVerificationEmailButton } from "@/components/ResendVerificationEmailButton";
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
    const [{ error }, qrSettings] = await Promise.all([searchParams, getQrPaymentSettings()]);
    const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    const qrConfigured = qrSettings.quickPaymentEnabled && Boolean(qrSettings.accountNumber && qrSettings.bankCode);
    return (
      <div className="flex flex-col gap-4">
        <InstallPrompt />
        <LoginCard error={error} googleEnabled={googleEnabled} />
        {qrConfigured && <QuickPaymentQr />}
      </div>
    );
  }

  const t = await getTranslations("dashboard");
  const tBanners = await getTranslations("banners");
  const [qrSettings, pendingOrderCleanupSettings] = await Promise.all([
    getQrPaymentSettings(),
    getPendingOrderCleanupSettingsStored(),
  ]);
  const qrConfigured = qrSettings.quickPaymentEnabled && Boolean(qrSettings.accountNumber && qrSettings.bankCode);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      groups: { include: { group: { include: { windows: true } } } },
    },
  });
  if (!user) return null;

  const now = new Date();
  const isAdmin = hasFreeGateEntry(user.role);
  const [activePass, dependents, pendingOrders] = await Promise.all([
    isAdmin
      ? Promise.resolve(null)
      : prisma.userAccessPass.findFirst({
          where: { userId: user.id, validFrom: { lte: now }, validTo: { gte: now } },
          orderBy: { validTo: "desc" },
        }),
    isAdmin ? Promise.resolve([]) : prisma.dependent.findMany({ where: { parentUserId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.paymentOrder.findMany({ where: { userId: user.id, status: PaymentStatus.PENDING }, orderBy: { createdAt: "asc" } }),
  ]);
  const inWindow = isAdmin || user.groups.some(({ group }) => isWithinWindows(group.windows, group.is24_7));
  const inCooldown = Boolean(user.cooldownUntil && user.cooldownUntil > now);
  const hasCredits = isAdmin || Boolean(activePass) || user.credits >= 1;

  const blocked = user.status !== "APPROVED" || user.suspended;
  const isPendingMinor = user.status === "PENDING" && user.birthDate !== null && calculateAge(toAppDateValue(user.birthDate)) < 18;

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="flex flex-col gap-2">
        {user.status === "PENDING" &&
          (isPendingMinor ? (
            <StatusBanner tone="warning">
              {tBanners.rich("pendingMinor", {
                link: (chunks) => (
                  <a
                    href="https://stenatisnov.cz/wp-content/uploads/2026/04/Souhlas_zakonneho_zastupce.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold underline"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </StatusBanner>
          ) : (
            <StatusBanner tone="warning">{tBanners("pending")}</StatusBanner>
          ))}
        {user.status === "REJECTED" && <StatusBanner tone="danger">{tBanners("suspended")}</StatusBanner>}
        {user.suspended && <StatusBanner tone="danger">{tBanners("suspended")}</StatusBanner>}
        {!user.emailVerified && (
          <StatusBanner tone="warning">
            {tBanners("emailUnverifiedNoThreat")}
            <ResendVerificationEmailButton />
          </StatusBanner>
        )}
        {!blocked && !inWindow && <StatusBanner tone="warning">{tBanners("outsideHours")}</StatusBanner>}
        {!blocked && !hasCredits && (
          <StatusBanner tone="warning">
            {tBanners.rich("noCredits", {
              link: (chunks) => (
                <Link href="/buy" className="font-semibold underline">
                  {chunks}
                </Link>
              ),
            })}
          </StatusBanner>
        )}
        {!blocked && inCooldown && <StatusBanner tone="info">{tBanners("cooldown")}</StatusBanner>}
      </div>

      {activePass && (
        <p className="text-center text-sm text-[var(--ok)]">
          {t("activePass")} — {t("activePassUntil", { date: formatAppDateTime(activePass.validTo) })}
        </p>
      )}

      {pendingOrders.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-[var(--ink)]">{t("pendingPaymentsTitle")}</h2>
          <ul className="mt-2 divide-y divide-[var(--line)] text-sm text-[var(--ink)]">
            {pendingOrders.map((order) => (
              <li key={order.id} className="flex items-center justify-between py-1.5">
                <span>
                  {t("pendingPaymentAmount", { amount: order.amountCzk })}
                  {order.credits > 0 && ` — ${t("pendingPaymentCredits", { count: order.credits })}`}
                </span>
                {order.variableSymbol && (
                  <span className="text-[var(--muted)]">{t("pendingPaymentVs", { vs: order.variableSymbol })}</span>
                )}
              </li>
            ))}
          </ul>
          {pendingOrderCleanupSettings.enabled && (
            <div className="mt-3">
              <StatusBanner tone="warning">
                {t("pendingPaymentAutoCancelHint", { hours: pendingOrderCleanupSettings.maxAgeHours })}
              </StatusBanner>
            </div>
          )}
        </div>
      )}

      <OpenGateButton
        disabled={blocked || !inWindow || (!hasCredits && !isAdmin) || inCooldown}
        initialCredits={isAdmin ? null : user.credits}
        unlimitedAccess={isAdmin}
        userEmail={user.email}
        dependents={dependents.map((dep) => ({ id: dep.id, name: dep.name, credits: dep.credits }))}
      />

      {!isAdmin && qrConfigured && <QuickPaymentQr />}
    </div>
  );
}
