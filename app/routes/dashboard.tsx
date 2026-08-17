import { PaymentStatus } from "@prisma/client";
import { data } from "react-router";
import type { Route } from "./+types/dashboard";
import { getPrisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session.server";
import { withLoadContext } from "@/lib/request-context.server";
import { getPendingOrderCleanupSettingsStored, getQrPaymentSettings } from "@/lib/settings";
import { calculateAge, formatAppDateTime, toAppDateValue, isWithinWindows } from "@/lib/time";
import { hasFreeGateEntry } from "@/lib/roles";
import { isGoogleOAuthEnabled } from "@/lib/google-auth.server";
import { useTranslations, Trans } from "@/i18n/translations";
import { Link } from "@/i18n/navigation";
import { OpenGateButton } from "@/components/OpenGateButton";
import { StatusBanner } from "@/components/StatusBanner";
import { LoginCard } from "@/components/LoginCard";
import { InstallPrompt } from "@/components/InstallPrompt";
import { QuickPaymentQr } from "@/components/QuickPaymentQr";
import { ResendVerificationEmailButton } from "@/components/ResendVerificationEmailButton";
import { loginAction, resendVerificationEmailAction } from "@/lib/actions/auth";
import { openGateAction, checkGateOnlineAction } from "@/lib/actions/gate";
import { generateQuickPaymentQrAction } from "@/lib/actions/payments";

export async function loader({ request, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser) {
      const [qrSettings, googleEnabled] = await Promise.all([getQrPaymentSettings(), isGoogleOAuthEnabled()]);
      const qrConfigured = qrSettings.quickPaymentEnabled && Boolean(qrSettings.accountNumber && qrSettings.bankCode);
      const error = new URL(request.url).searchParams.get("error") ?? undefined;
      return data({ loggedIn: false as const, googleEnabled, qrConfigured, error });
    }

    const prisma = await getPrisma();
    const [qrSettings, pendingOrderCleanupSettings, user] = await Promise.all([
      getQrPaymentSettings(),
      getPendingOrderCleanupSettingsStored(),
      prisma.user.findUnique({
        where: { id: sessionUser.id },
        include: { groups: { include: { group: { include: { windows: true } } } } },
      }),
    ]);
    if (!user) return data({ loggedIn: false as const, googleEnabled: false, qrConfigured: false, error: undefined });

    const qrConfigured = qrSettings.quickPaymentEnabled && Boolean(qrSettings.accountNumber && qrSettings.bankCode);
    const now = new Date();
    const isAdmin = hasFreeGateEntry(user.role);
    const [activePass, dependents, pendingOrders] = await Promise.all([
      isAdmin
        ? Promise.resolve(null)
        : prisma.userAccessPass.findFirst({
            where: { userId: user.id, validFrom: { lte: now }, validTo: { gte: now } },
            orderBy: { validTo: "desc" },
          }),
      isAdmin
        ? Promise.resolve([])
        : prisma.dependent.findMany({ where: { parentUserId: user.id }, orderBy: { createdAt: "asc" } }),
      prisma.paymentOrder.findMany({ where: { userId: user.id, status: PaymentStatus.PENDING }, orderBy: { createdAt: "asc" } }),
    ]);
    const inWindow = isAdmin || user.groups.some(({ group }) => isWithinWindows(group.windows, group.is24_7));
    const inCooldown = Boolean(user.cooldownUntil && user.cooldownUntil > now);
    const hasCredits = isAdmin || Boolean(activePass) || user.credits >= 1;
    const blocked = user.status !== "APPROVED" || user.suspended;
    const isPendingMinor =
      user.status === "PENDING" && user.birthDate !== null && calculateAge(toAppDateValue(user.birthDate)) < 18;

    return data({
      loggedIn: true as const,
      qrConfigured,
      isAdmin,
      blocked,
      inWindow,
      inCooldown,
      hasCredits,
      isPendingMinor,
      status: user.status,
      suspended: user.suspended,
      emailVerified: user.emailVerified,
      email: user.email,
      credits: user.credits,
      activePassValidTo: activePass?.validTo ?? null,
      pendingOrderCleanupSettings,
      pendingOrders: pendingOrders.map((order) => ({
        id: order.id,
        amountCzk: order.amountCzk,
        credits: order.credits,
        variableSymbol: order.variableSymbol,
      })),
      dependents: dependents.map((dep) => ({ id: dep.id, name: dep.name, credits: dep.credits })),
    });
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    const intent = formData.get("intent");
    if (intent === null) {
      return loginAction(formData, request, params.locale!);
    }
    switch (String(intent)) {
      case "openGate":
        return openGateAction(request, formData.get("openGate") === "true", formData.getAll("dependentIds").map(String));
      case "checkGateOnline":
        return checkGateOnlineAction();
      case "resendVerificationEmail":
        return resendVerificationEmailAction(request);
      case "generateQuickPaymentQr":
        return generateQuickPaymentQrAction(Number(formData.get("amountCzk")));
      default:
        throw data(null, { status: 400 });
    }
  });
}

export default function DashboardPage({ loaderData }: Route.ComponentProps) {
  const t = useTranslations("dashboard");
  const tBanners = useTranslations("banners");

  if (!loaderData.loggedIn) {
    return (
      <div className="flex flex-col gap-4">
        <InstallPrompt />
        <LoginCard error={loaderData.error} googleEnabled={loaderData.googleEnabled} />
        {loaderData.qrConfigured && <QuickPaymentQr />}
      </div>
    );
  }

  const {
    isAdmin,
    blocked,
    inWindow,
    inCooldown,
    hasCredits,
    isPendingMinor,
    status,
    suspended,
    emailVerified,
    email,
    credits,
    activePassValidTo,
    pendingOrderCleanupSettings,
    pendingOrders,
    dependents,
    qrConfigured,
  } = loaderData;

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="flex flex-col gap-2">
        {status === "PENDING" &&
          (isPendingMinor ? (
            <StatusBanner tone="warning">
              <Trans
                t={tBanners}
                i18nKey="pendingMinor"
                components={{
                  link: (
                    <a
                      href="https://stenatisnov.cz/wp-content/uploads/2026/04/Souhlas_zakonneho_zastupce.pdf"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold underline"
                    />
                  ),
                }}
              />
            </StatusBanner>
          ) : (
            <StatusBanner tone="warning">{tBanners("pending")}</StatusBanner>
          ))}
        {status === "REJECTED" && <StatusBanner tone="danger">{tBanners("suspended")}</StatusBanner>}
        {suspended && <StatusBanner tone="danger">{tBanners("suspended")}</StatusBanner>}
        {!emailVerified && (
          <StatusBanner tone="warning">
            {tBanners("emailUnverifiedNoThreat")}
            <ResendVerificationEmailButton />
          </StatusBanner>
        )}
        {!blocked && !inWindow && <StatusBanner tone="warning">{tBanners("outsideHours")}</StatusBanner>}
        {!blocked && !hasCredits && (
          <StatusBanner tone="warning">
            <Trans
              t={tBanners}
              i18nKey="noCredits"
              components={{ link: <Link href="/buy" className="font-semibold underline" /> }}
            />
          </StatusBanner>
        )}
        {!blocked && inCooldown && <StatusBanner tone="info">{tBanners("cooldown")}</StatusBanner>}
      </div>

      {activePassValidTo && (
        <p className="text-center text-sm text-[var(--ok)]">
          {t("activePass")} — {t("activePassUntil", { date: formatAppDateTime(activePassValidTo) })}
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
        initialCredits={isAdmin || activePassValidTo ? null : credits}
        unlimitedAccess={isAdmin}
        userEmail={email}
        dependents={dependents}
      />

      {!isAdmin && qrConfigured && <QuickPaymentQr />}
    </div>
  );
}
