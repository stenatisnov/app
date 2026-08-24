import { PackageKind, PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sendPaymentPendingAdminEmails } from "@/lib/registration-mail";
import { canUseApp, getSessionUser } from "@/lib/session.server";
import { getQrPaymentSettings, getGoPaySettings } from "@/lib/settings";
import { buildSpdPayload, qrDataUrl } from "@/lib/qr";
import { confirmPaymentOrder } from "@/lib/payments";

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

/** Czech noun declension for "vstup" (entry/credit) after a count — 1 vstup, 2-4 vstupy, 0/5+ vstupů. */
function czVstupu(count: number): string {
  if (count === 1) return "vstup";
  if (count >= 2 && count <= 4) return "vstupy";
  return "vstupů";
}

/** Fixed "2 dospělí + max 3 děti" shape of a FAMILY package — not admin-configurable. */
const FAMILY_ADULT_CAP = 1;
const FAMILY_CHILD_CAP = 3;

/**
 * Validates the buyer's chosen FAMILY-package companions server-side — never
 * trust the client's cap enforcement. Every id must be one of the buyer's
 * own Doprovod, and the adult/child split (by each one's *current*
 * PersonType.isChildCategory) must stay within the fixed caps. Returns the
 * validated id list, or `null` if anything is invalid/over cap.
 */
async function validateFamilyCompanions(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
  userId: string,
  requestedIds: string[],
): Promise<string[] | null> {
  if (requestedIds.length === 0) return [];
  const dependents = await prisma.dependent.findMany({
    where: { id: { in: requestedIds }, parentUserId: userId },
    include: { personType: true },
  });
  if (dependents.length !== requestedIds.length) return null;

  const adultCount = dependents.filter((d) => !d.personType?.isChildCategory).length;
  const childCount = dependents.filter((d) => d.personType?.isChildCategory).length;
  if (adultCount > FAMILY_ADULT_CAP || childCount > FAMILY_CHILD_CAP) return null;

  return dependents.map((d) => d.id);
}

/**
 * Validates the buyer's chosen bulk-payment companions server-side and prices
 * them — never trust the client's selection or displayed price. Every id must
 * be one of the buyer's own Doprovod, and each one must have its own active
 * "1 vstup" (credits: 1) CREDITS package (a companion whose category has none
 * simply can't be included). Returns the validated id list plus the sum of
 * each companion's own package price, or `null` if anything is invalid.
 */
async function validateAndPriceBulkCompanions(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
  userId: string,
  requestedIds: string[],
): Promise<{ ids: string[]; totalExtraCzk: number } | null> {
  if (requestedIds.length === 0) return { ids: [], totalExtraCzk: 0 };
  const dependents = await prisma.dependent.findMany({
    where: { id: { in: requestedIds }, parentUserId: userId },
    include: { personType: { include: { packages: true } } },
  });
  if (dependents.length !== requestedIds.length) return null;

  let totalExtraCzk = 0;
  for (const dep of dependents) {
    const pkg = dep.personType?.packages.find((p) => p.kind === PackageKind.CREDITS && p.credits === 1 && p.active);
    if (!pkg) return null;
    totalExtraCzk += pkg.priceCzk;
  }

  return { ids: dependents.map((d) => d.id), totalExtraCzk };
}

export async function createPaymentOrderAction(formData: FormData, request: Request) {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) return { error: "auth" as const };
  const access = canUseApp(sessionUser);
  if (!access.ok) return { error: access.reason as "pending" | "suspended" };

  const prisma = await getPrisma();
  const packageId = String(formData.get("packageId") || "");
  const method = String(formData.get("method") || "QR") as "QR" | "GOPAY";
  const dependentId = String(formData.get("dependentId") || "") || null;

  if (method === "GOPAY") {
    const gopaySettings = await getGoPaySettings();
    if (!gopaySettings.enabled) return { error: "gopay_not_configured" as const };
  }

  const pkg = await prisma.pricePackage.findUnique({ where: { id: packageId } });
  if (!pkg || !pkg.active) return { error: "package" as const };

  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) return { error: "person_type" as const };

  // Dependents (companions) are credits-only — buying a PERIOD pass "for" one
  // isn't supported, and a FAMILY package is always bought "for self" (the
  // buyer picks companions via familyDependentIds, not by being one).
  let dependentName: string | null = null;
  if (dependentId) {
    if (pkg.kind === PackageKind.PERIOD || pkg.kind === PackageKind.FAMILY) return { error: "person_type" as const };
    const dependent = await prisma.dependent.findFirst({ where: { id: dependentId, parentUserId: user.id } });
    if (!dependent || dependent.personTypeId !== pkg.personTypeId) return { error: "person_type" as const };
    dependentName = dependent.name;
  } else if (user.personTypeId !== pkg.personTypeId) {
    return { error: "person_type" as const };
  }

  let familyCompanionIds: string[] | null = null;
  if (!dependentId && pkg.kind === PackageKind.FAMILY) {
    const requestedIds = formData.getAll("familyDependentIds").map(String);
    familyCompanionIds = await validateFamilyCompanions(prisma, user.id, requestedIds);
    if (familyCompanionIds === null) return { error: "family_selection" as const };
  }

  // Bulk group payment: only ever attaches to buying yourself a single "1
  // vstup" package — cheap no-op when nothing was selected (no dependent
  // companion ids submitted), otherwise sums each selected companion's own
  // current package price into the total charged.
  let bulkCompanionIds: string[] | null = null;
  let bulkExtraCzk = 0;
  if (!dependentId && pkg.kind === PackageKind.CREDITS && pkg.credits === 1) {
    const requestedIds = formData.getAll("bulkDependentIds").map(String);
    const bulkResult = await validateAndPriceBulkCompanions(prisma, user.id, requestedIds);
    if (bulkResult === null) return { error: "bulk_selection" as const };
    bulkCompanionIds = bulkResult.ids;
    bulkExtraCzk = bulkResult.totalExtraCzk;
  }
  // Shown on the bank statement (QR message below) and in the payment-check
  // page's order lists (via order.note) — both need to say how many entries
  // this order actually covers, since order.credits only ever reflects the
  // buyer's own 1, not the companions credited alongside it.
  const bulkTotalPeople = 1 + (bulkCompanionIds?.length ?? 0);
  const bulkNote = bulkCompanionIds && bulkCompanionIds.length > 0 ? `Hromadná platba — ${bulkTotalPeople} ${czVstupu(bulkTotalPeople)}` : null;

  const qrSettings = await getQrPaymentSettings();
  // The SPD QR payload (buildSpdPayload in qr.ts) truncates VS to the spec's
  // 10-digit max — generating anything longer here would create a payment
  // order whose stored variableSymbol can never match what the bank transfer
  // actually carries, so the Fio auto-confirm poll would never find it.
  const vsPrefixDigits = qrSettings.vsPrefix.replace(/\D/g, "").slice(0, 9);
  const vs = `${vsPrefixDigits}${Date.now().toString().slice(-(10 - vsPrefixDigits.length))}`;

  const order = await prisma.paymentOrder.create({
    data: {
      userId: user.id,
      dependentId,
      packageId: pkg.id,
      method: method === "GOPAY" ? PaymentMethod.GOPAY : PaymentMethod.QR,
      status: PaymentStatus.PENDING,
      credits: pkg.kind === PackageKind.PERIOD ? 0 : pkg.credits,
      familyCompanionIds: familyCompanionIds ?? Prisma.DbNull,
      bulkCompanionIds: bulkCompanionIds ?? Prisma.DbNull,
      amountCzk: pkg.priceCzk + bulkExtraCzk,
      variableSymbol: vs,
      note: bulkNote ?? (pkg.kind === PackageKind.PERIOD ? `period:${pkg.periodPreset || "CUSTOM"}` : null),
    },
  });

  await audit({
    action: "payment.create",
    success: true,
    userId: user.id,
    meta: { orderId: order.id, method, amountCzk: order.amountCzk, packageKind: pkg.kind },
  });

  if (method === "QR") {
    try {
      await sendPaymentPendingAdminEmails({
        id: order.id,
        credits: order.credits,
        amountCzk: order.amountCzk,
        variableSymbol: order.variableSymbol,
        method: order.method,
        user: { email: user.email, name: user.name },
        dependentName,
        packageKind: pkg.kind,
        periodPreset: pkg.periodPreset,
        bulkCompanionCount: bulkCompanionIds?.length || undefined,
      });
    } catch (err) {
      console.error("[mail] payment pending admin emails failed:", err);
    }

    if (!qrSettings.accountNumber || !qrSettings.bankCode) return { error: "qr_not_configured" as const };

    // Credits packages get a fixed "Platba za N vstupů" note instead of the
    // admin-configured template, so the bank statement itself says what the
    // payment was for. Constant symbol 1 marks every app-generated QR
    // payment, distinguishing it from ad-hoc transfers unrelated to a
    // package purchase (see payment-check's "unmatched" sections).
    const message =
      bulkNote
        ? `Platba za ${bulkTotalPeople} ${czVstupu(bulkTotalPeople)} (hromadná platba)`
        : pkg.kind === PackageKind.CREDITS
          ? `Platba za ${pkg.credits} ${czVstupu(pkg.credits)}`
          : pkg.kind === PackageKind.FAMILY
            ? "Platba za rodinné vstupné"
            : qrSettings.messageTemplate.replace("{vs}", vs);

    let payload: string;
    try {
      payload = buildSpdPayload({
        accountNumber: qrSettings.accountNumber,
        bankCode: qrSettings.bankCode,
        amountCzk: order.amountCzk,
        variableSymbol: vs,
        constantSymbol: "1",
        message,
      });
    } catch {
      return { error: "qr_account" as const };
    }
    const qr = await qrDataUrl(payload);
    return { ok: true as const, orderId: order.id, vs, amountCzk: order.amountCzk, qr, spd: payload, method: "QR" as const };
  }

  // GoPay: until the real checkout + webhook are wired up, treat order
  // creation as an immediately successful payment so the flow is testable.
  const confirmed = await confirmPaymentOrder(order.id, { source: "gopay" });

  return {
    ok: true as const,
    orderId: order.id,
    vs,
    amountCzk: order.amountCzk,
    method: "GOPAY" as const,
    confirmed: confirmed.ok,
    applied: confirmed.ok ? confirmed.applied : undefined,
  };
}

export type QuickPaymentQrResult = { ok: true; qr: string; spd: string } | { ok: false; error: string };

/**
 * Anonymous "pay for a walk-in entry right now" QR on the landing page —
 * no account, no PaymentOrder row, just the club's configured bank details
 * plus whatever amount the visitor types. Regenerated on every amount
 * change (debounced client-side), so it stays a cheap, side-effect-free
 * computation rather than something that needs its own audit trail.
 */
export async function generateQuickPaymentQrAction(amountCzk: number): Promise<QuickPaymentQrResult> {
  if (!Number.isFinite(amountCzk) || amountCzk <= 0) return { ok: false, error: "invalid_amount" };

  const qrSettings = await getQrPaymentSettings();
  if (!qrSettings.accountNumber || !qrSettings.bankCode) return { ok: false, error: "not_configured" };

  try {
    const message = qrSettings.messageTemplate.replace("{vs}", "").replace(/\s+/g, " ").trim();
    const spd = buildSpdPayload({
      accountNumber: qrSettings.accountNumber,
      bankCode: qrSettings.bankCode,
      amountCzk,
      message: message || undefined,
    });
    const qr = await qrDataUrl(spd);
    return { ok: true, qr, spd };
  } catch {
    return { ok: false, error: "account_error" };
  }
}

/**
 * Re-renders the QR for an existing pending QR order (dashboard's "Tyto
 * platby čekají na připsání" list) — same payload the order's original QR
 * carried (constant symbol 1, same message convention), just recomputed on
 * demand instead of persisting the image, so a member who lost/closed the
 * original QR can pull it back up without creating a second order.
 */
export async function regeneratePaymentQrAction(orderId: string, request: Request): Promise<QuickPaymentQrResult> {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) return { ok: false, error: "not_found" };

  const prisma = await getPrisma();
  const order = await prisma.paymentOrder.findFirst({
    where: { id: orderId, userId: sessionUser.id, status: PaymentStatus.PENDING, method: PaymentMethod.QR },
  });
  if (!order) return { ok: false, error: "not_found" };

  const qrSettings = await getQrPaymentSettings();
  if (!qrSettings.accountNumber || !qrSettings.bankCode) return { ok: false, error: "not_configured" };

  const message =
    order.credits > 0
      ? `Platba za ${order.credits} ${czVstupu(order.credits)}`
      : qrSettings.messageTemplate.replace("{vs}", order.variableSymbol ?? "");

  try {
    const payload = buildSpdPayload({
      accountNumber: qrSettings.accountNumber,
      bankCode: qrSettings.bankCode,
      amountCzk: order.amountCzk,
      variableSymbol: order.variableSymbol ?? undefined,
      constantSymbol: "1",
      message,
    });
    const qr = await qrDataUrl(payload);
    return { ok: true, qr, spd: payload };
  } catch {
    return { ok: false, error: "account_error" };
  }
}
