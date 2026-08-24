import { PackageKind, PaymentMethod, PaymentStatus, Prisma, type PeriodPreset } from "@prisma/client";
import { getPrisma } from "@/lib/db.server";
import { audit } from "@/lib/audit";
import { sendPaymentPendingAdminEmails } from "@/lib/registration-mail";
import { canUseApp, getSessionUser } from "@/lib/session.server";
import { getQrPaymentSettings, getGoPaySettings } from "@/lib/settings";
import { buildSpdPayload, qrDataUrl } from "@/lib/qr";
import { confirmPaymentOrder } from "@/lib/payments";

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

/**
 * Shared across both purchase actions below (and their common `finalizeOrder`
 * tail) — explicit, since inferring it from separate functions' return
 * statements doesn't cross-widen the way a single function's own sibling
 * returns would, which would otherwise make `result.ok`/`result.error`
 * unsafe to read without narrowing every branch first on the client.
 */
type PurchaseResult =
  | { ok?: undefined; error: string }
  | { ok: true; error?: undefined; orderId: string; vs: string; amountCzk: number; qr: string; spd: string; method: "QR" }
  | {
      ok: true;
      error?: undefined;
      orderId: string;
      vs: string;
      amountCzk: number;
      method: "GOPAY";
      confirmed: boolean;
      applied: unknown;
    };

/** Czech noun declension for "vstup" (entry/credit) after a count — 1 vstup, 2-4 vstupy, 0/5+ vstupů. */
function czVstupu(count: number): string {
  if (count === 1) return "vstup";
  if (count >= 2 && count <= 4) return "vstupy";
  return "vstupů";
}

/** Czech noun declension for "osoba" (person) after a count — 1 osoba, 2-4 osoby, 0/5+ osob. */
function czOsoba(count: number): string {
  if (count === 1) return "osoba";
  if (count >= 2 && count <= 4) return "osoby";
  return "osob";
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

type PlatbaItem = { recipientId: string; packageId: string; credits: number; priceCzk: number };

/**
 * Validates + prices every (recipient, package) pair for a Platba order —
 * never trust the client's selection or displayed price. Each package must
 * be an active CREDITS package belonging to that recipient's own category
 * ("self" → the buyer's own PersonType, otherwise one of the buyer's own
 * Doprovod). Rejects duplicate recipients. Returns the validated+priced
 * items, or `null` if anything is invalid.
 */
async function validateAndPricePlatbaItems(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
  user: { id: string; personTypeId: string | null },
  pairs: { recipientId: string; packageId: string }[],
): Promise<PlatbaItem[] | null> {
  if (pairs.length === 0) return null;
  if (new Set(pairs.map((p) => p.recipientId)).size !== pairs.length) return null;

  const packages = await prisma.pricePackage.findMany({
    where: { id: { in: [...new Set(pairs.map((p) => p.packageId))] } },
  });

  const dependentIds = pairs.filter((p) => p.recipientId !== "self").map((p) => p.recipientId);
  const dependents = dependentIds.length
    ? await prisma.dependent.findMany({ where: { id: { in: dependentIds }, parentUserId: user.id } })
    : [];

  const items: PlatbaItem[] = [];
  for (const pair of pairs) {
    const pkg = packages.find((p) => p.id === pair.packageId);
    if (!pkg || !pkg.active || pkg.kind !== PackageKind.CREDITS) return null;

    const recipientPersonTypeId = pair.recipientId === "self" ? user.personTypeId : dependents.find((d) => d.id === pair.recipientId)?.personTypeId;
    if (!recipientPersonTypeId || recipientPersonTypeId !== pkg.personTypeId) return null;

    items.push({ recipientId: pair.recipientId, packageId: pkg.id, credits: pkg.credits, priceCzk: pkg.priceCzk });
  }

  return items;
}

/**
 * Shared tail for both purchase actions below — auditing, the "payment
 * pending" admin notification, and either the QR-code response or the
 * (simulated-until-wired) immediate GoPay confirmation. Callers have
 * already created `order` and computed the QR bank-transfer `message`.
 */
async function finalizeOrder(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
  user: { id: string; email: string; name: string | null },
  order: { id: string; amountCzk: number; variableSymbol: string | null; method: PaymentMethod; credits: number },
  method: "QR" | "GOPAY",
  message: string,
  qrSettings: Awaited<ReturnType<typeof getQrPaymentSettings>>,
  adminEmailExtra: {
    dependentName?: string | null;
    packageKind: PackageKind | null;
    periodPreset: PeriodPreset | null;
    platbaSummary?: string;
  },
): Promise<PurchaseResult> {
  await audit({
    action: "payment.create",
    success: true,
    userId: user.id,
    meta: { orderId: order.id, method, amountCzk: order.amountCzk, packageKind: adminEmailExtra.packageKind },
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
        ...adminEmailExtra,
      });
    } catch (err) {
      console.error("[mail] payment pending admin emails failed:", err);
    }

    if (!qrSettings.accountNumber || !qrSettings.bankCode) return { error: "qr_not_configured" as const };

    // Constant symbol 1 marks every app-generated QR payment, distinguishing
    // it from ad-hoc transfers unrelated to a package purchase (see
    // payment-check's "unmatched" sections).
    let payload: string;
    try {
      payload = buildSpdPayload({
        accountNumber: qrSettings.accountNumber,
        bankCode: qrSettings.bankCode,
        amountCzk: order.amountCzk,
        variableSymbol: order.variableSymbol ?? undefined,
        constantSymbol: "1",
        message,
      });
    } catch {
      return { error: "qr_account" as const };
    }
    const qr = await qrDataUrl(payload);
    return {
      ok: true as const,
      orderId: order.id,
      vs: order.variableSymbol ?? "",
      amountCzk: order.amountCzk,
      qr,
      spd: payload,
      method: "QR" as const,
    };
  }

  // GoPay: until the real checkout + webhook are wired up, treat order
  // creation as an immediately successful payment so the flow is testable.
  const confirmed = await confirmPaymentOrder(order.id, { source: "gopay" });

  return {
    ok: true as const,
    orderId: order.id,
    vs: order.variableSymbol ?? "",
    amountCzk: order.amountCzk,
    method: "GOPAY" as const,
    confirmed: confirmed.ok,
    applied: confirmed.ok ? confirmed.applied : undefined,
  };
}

/** Buys a PERIOD pass or a FAMILY package (self only — neither is offered "for a dependent"). Credits purchases go through `createPlatbaOrderAction` instead. */
export async function createPaymentOrderAction(formData: FormData, request: Request): Promise<PurchaseResult> {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) return { error: "auth" as const };
  const access = canUseApp(sessionUser);
  if (!access.ok) return { error: access.reason as "pending" | "suspended" };

  const prisma = await getPrisma();
  const packageId = String(formData.get("packageId") || "");
  const method = String(formData.get("method") || "QR") as "QR" | "GOPAY";

  if (method === "GOPAY") {
    const gopaySettings = await getGoPaySettings();
    if (!gopaySettings.enabled) return { error: "gopay_not_configured" as const };
  }

  const pkg = await prisma.pricePackage.findUnique({ where: { id: packageId } });
  if (!pkg || !pkg.active) return { error: "package" as const };
  if (pkg.kind !== PackageKind.PERIOD && pkg.kind !== PackageKind.FAMILY) return { error: "package" as const };

  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) return { error: "person_type" as const };
  if (user.personTypeId !== pkg.personTypeId) return { error: "person_type" as const };

  let familyCompanionIds: string[] | null = null;
  if (pkg.kind === PackageKind.FAMILY) {
    const requestedIds = formData.getAll("familyDependentIds").map(String);
    familyCompanionIds = await validateFamilyCompanions(prisma, user.id, requestedIds);
    if (familyCompanionIds === null) return { error: "family_selection" as const };
  }

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
      packageId: pkg.id,
      method: method === "GOPAY" ? PaymentMethod.GOPAY : PaymentMethod.QR,
      status: PaymentStatus.PENDING,
      credits: pkg.kind === PackageKind.PERIOD ? 0 : pkg.credits,
      familyCompanionIds: familyCompanionIds ?? Prisma.DbNull,
      amountCzk: pkg.priceCzk,
      variableSymbol: vs,
      note: pkg.kind === PackageKind.PERIOD ? `period:${pkg.periodPreset || "CUSTOM"}` : null,
    },
  });

  const message = pkg.kind === PackageKind.FAMILY ? "Platba za rodinné vstupné" : qrSettings.messageTemplate.replace("{vs}", vs);

  return finalizeOrder(prisma, user, order, method, message, qrSettings, {
    packageKind: pkg.kind,
    periodPreset: pkg.periodPreset,
  });
}

/**
 * Buys credits for the buyer and/or any number of their own Doprovod in one
 * combined order ("Platba") — each recipient picks any of their own active
 * CREDITS packages. Supersedes what used to be separate "buy N credits for
 * myself" / "buy N credits for a specific dependent" flows.
 */
export async function createPlatbaOrderAction(formData: FormData, request: Request): Promise<PurchaseResult> {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) return { error: "auth" as const };
  const access = canUseApp(sessionUser);
  if (!access.ok) return { error: access.reason as "pending" | "suspended" };

  const prisma = await getPrisma();
  const method = String(formData.get("method") || "QR") as "QR" | "GOPAY";

  if (method === "GOPAY") {
    const gopaySettings = await getGoPaySettings();
    if (!gopaySettings.enabled) return { error: "gopay_not_configured" as const };
  }

  const pairs = formData
    .getAll("items")
    .map(String)
    .map((s) => {
      const [recipientId, packageId] = s.split(":");
      return recipientId && packageId ? { recipientId, packageId } : null;
    })
    .filter((p): p is { recipientId: string; packageId: string } => p !== null);
  if (pairs.length === 0) return { error: "no_items" as const };

  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) return { error: "no_items" as const };

  const items = await validateAndPricePlatbaItems(prisma, user, pairs);
  if (items === null) return { error: "item_selection" as const };

  const totalCredits = items.reduce((sum, i) => sum + i.credits, 0);
  const totalCzk = items.reduce((sum, i) => sum + i.priceCzk, 0);
  const totalPeople = items.length;
  const summary = `Platba — ${totalPeople} ${czOsoba(totalPeople)}, ${totalCredits} ${czVstupu(totalCredits)}`;

  const qrSettings = await getQrPaymentSettings();
  const vsPrefixDigits = qrSettings.vsPrefix.replace(/\D/g, "").slice(0, 9);
  const vs = `${vsPrefixDigits}${Date.now().toString().slice(-(10 - vsPrefixDigits.length))}`;

  const order = await prisma.paymentOrder.create({
    data: {
      userId: user.id,
      packageId: null,
      method: method === "GOPAY" ? PaymentMethod.GOPAY : PaymentMethod.QR,
      status: PaymentStatus.PENDING,
      credits: totalCredits,
      items,
      amountCzk: totalCzk,
      variableSymbol: vs,
      note: summary,
    },
  });

  return finalizeOrder(prisma, user, order, method, summary, qrSettings, {
    packageKind: null,
    periodPreset: null,
    platbaSummary: summary,
  });
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
    order.note && order.note.startsWith("Platba —")
      ? order.note
      : order.credits > 0
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
