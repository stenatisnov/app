import { PackageKind, PaymentStatus, type Prisma, type PrismaClient, type PeriodPreset } from "@prisma/client";
import { getPrisma } from "./db";
import { resolvePeriodBounds } from "./access-pass";
import { audit } from "./audit";
import { sendPaymentReceiptEmail } from "./registration-mail";

type Tx = Prisma.TransactionClient;

/** Fixed "2 dospělí + max 3 děti" shape of a FAMILY package — mirrors the same constants in actions/payments.ts (re-validated here since a companion's category can change between purchase and confirmation). */
const FAMILY_ADULT_CAP = 1;
const FAMILY_CHILD_CAP = 3;

type ConfirmableOrder = {
  id: string;
  userId: string;
  /** Set when this order was bought for a dependent (companion) rather than the account holder themselves. */
  dependentId: string | null;
  credits: number;
  method: string;
  note: string | null;
  /** Companion ids picked at purchase time for a FAMILY package — see PaymentOrder.familyCompanionIds. */
  familyCompanionIds: unknown;
  /** Recipient+package pairs picked at purchase time for a Platba order — see PaymentOrder.items. */
  items: unknown;
  package: {
    id: string;
    kind: PackageKind;
    periodPreset: PeriodPreset | null;
    periodFrom: Date | null;
    periodTo: Date | null;
  } | null;
};

async function applyConfirmedOrder(tx: Tx, order: ConfirmableOrder, confirmedById: string | null) {
  await tx.paymentOrder.update({
    where: { id: order.id },
    data: { status: PaymentStatus.CONFIRMED, confirmedAt: new Date(), confirmedById },
  });

  // Platba (multi-person purchase) — checked first since order.items being
  // populated is the unambiguous signal a plain packageId doesn't give us
  // (a Platba order always has packageId: null). Every recipient's package
  // is re-fetched fresh here (never trust the credits/price captured at
  // purchase time) and each gets their package's *current* credits.
  const requestedItems = Array.isArray(order.items)
    ? order.items.filter(
        (i): i is { recipientId: string; packageId: string } =>
          typeof i === "object" && i !== null && typeof (i as Record<string, unknown>).recipientId === "string" && typeof (i as Record<string, unknown>).packageId === "string",
      )
    : [];
  if (requestedItems.length > 0) {
    const packages = await tx.pricePackage.findMany({ where: { id: { in: requestedItems.map((i) => i.packageId) } } });
    const packageById = new Map(packages.map((p) => [p.id, p]));

    const dependentIds = requestedItems.filter((i) => i.recipientId !== "self").map((i) => i.recipientId);
    const dependents = dependentIds.length
      ? await tx.dependent.findMany({ where: { id: { in: dependentIds }, parentUserId: order.userId } })
      : [];
    const dependentIdSet = new Set(dependents.map((d) => d.id));

    let totalCredits = 0;
    for (const item of requestedItems) {
      const pkg = packageById.get(item.packageId);
      if (!pkg) continue;
      if (item.recipientId !== "self" && !dependentIdSet.has(item.recipientId)) continue; // dependent removed/reassigned since purchase

      totalCredits += pkg.credits;
      if (item.recipientId === "self") {
        await tx.user.update({ where: { id: order.userId }, data: { credits: { increment: pkg.credits } } });
        await tx.creditLedger.create({
          data: { userId: order.userId, delta: pkg.credits, reason: "payment_confirmed", meta: { orderId: order.id, method: order.method, platba: true } },
        });
      } else {
        await tx.dependent.update({ where: { id: item.recipientId }, data: { credits: { increment: pkg.credits } } });
        await tx.creditLedger.create({
          data: {
            userId: order.userId,
            dependentId: item.recipientId,
            delta: pkg.credits,
            reason: "payment_confirmed_dependent",
            meta: { orderId: order.id, method: order.method, platba: true },
          },
        });
      }
    }
    return { kind: "credits" as const, credits: totalCredits };
  }

  const pkg = order.package;
  const isPeriodOrder =
    pkg?.kind === PackageKind.PERIOD || (order.credits === 0 && Boolean(order.note?.startsWith("period:")));

  if (isPeriodOrder && order.dependentId) {
    // Dependents (companions) are credits-only in v1 — the buy flow never
    // offers PERIOD packages for them, so reaching this means a bug upstream.
    throw new Error("PERIOD_PACKAGE_NOT_SUPPORTED_FOR_DEPENDENT");
  }

  if (isPeriodOrder && pkg) {
    const bounds = resolvePeriodBounds(pkg, new Date());
    if (!bounds) throw new Error("INVALID_PERIOD_PACKAGE");

    await tx.userAccessPass.create({
      data: {
        userId: order.userId,
        packageId: pkg.id,
        paymentOrderId: order.id,
        validFrom: bounds.validFrom,
        validTo: bounds.validTo,
        label: bounds.label,
      },
    });
    await tx.creditLedger.create({
      data: {
        userId: order.userId,
        delta: 0,
        reason: "payment_confirmed_pass",
        meta: {
          orderId: order.id,
          method: order.method,
          validFrom: bounds.validFrom.toISOString(),
          validTo: bounds.validTo.toISOString(),
        },
      },
    });
    return { kind: "period" as const, validTo: bounds.validTo };
  }

  if (pkg?.kind === PackageKind.FAMILY) {
    // Buyer's own credit — same as a plain self purchase below.
    await tx.user.update({ where: { id: order.userId }, data: { credits: { increment: order.credits } } });
    await tx.creditLedger.create({
      data: {
        userId: order.userId,
        delta: order.credits,
        reason: "payment_confirmed",
        meta: { orderId: order.id, method: order.method, family: true },
      },
    });

    const requestedIds = Array.isArray(order.familyCompanionIds)
      ? order.familyCompanionIds.filter((id): id is string => typeof id === "string")
      : [];
    if (requestedIds.length > 0) {
      // Re-classify fresh at confirmation time — a companion's category (or
      // existence) may have changed since purchase — and re-cap defensively.
      const dependents = await tx.dependent.findMany({
        where: { id: { in: requestedIds }, parentUserId: order.userId },
        include: { personType: true },
      });
      const adults = dependents.filter((d) => !d.personType?.isChildCategory).slice(0, FAMILY_ADULT_CAP);
      const children = dependents.filter((d) => d.personType?.isChildCategory).slice(0, FAMILY_CHILD_CAP);
      for (const dep of [...adults, ...children]) {
        await tx.dependent.update({ where: { id: dep.id }, data: { credits: { increment: 1 } } });
        await tx.creditLedger.create({
          data: {
            userId: order.userId,
            dependentId: dep.id,
            delta: 1,
            reason: "payment_confirmed_dependent",
            meta: { orderId: order.id, method: order.method, family: true },
          },
        });
      }
    }

    return { kind: "credits" as const, credits: order.credits };
  }

  if (order.dependentId) {
    await tx.dependent.update({
      where: { id: order.dependentId },
      data: { credits: { increment: order.credits } },
    });
    await tx.creditLedger.create({
      data: {
        userId: order.userId,
        dependentId: order.dependentId,
        delta: order.credits,
        reason: "payment_confirmed_dependent",
        meta: { orderId: order.id, method: order.method },
      },
    });
    return { kind: "credits" as const, credits: order.credits };
  }

  await tx.user.update({
    where: { id: order.userId },
    data: { credits: { increment: order.credits } },
  });
  await tx.creditLedger.create({
    data: {
      userId: order.userId,
      delta: order.credits,
      reason: "payment_confirmed",
      meta: { orderId: order.id, method: order.method },
    },
  });
  return { kind: "credits" as const, credits: order.credits };
}

/**
 * Confirms a pending payment order, granting either credits or a period
 * access pass. Called by the admin "confirm QR payment" action, by the
 * (simulated-until-wired) GoPay checkout / webhook, and by the Fio bank
 * API poll (`fio.ts`) matching an incoming transfer to its variable symbol.
 *
 * Takes an explicit `client` (defaulting to `getPrisma()`) so callers
 * running outside the normal request lifecycle — e.g. the D1 branch's
 * scheduled Fio poll, which builds its own client the same way the backup
 * jobs do — can thread theirs through instead.
 */
export async function confirmPaymentOrder(
  orderId: string,
  opts: {
    confirmedById?: string | null;
    source: "admin" | "gopay" | "fio";
    /** Extra fields merged into the audit log entry, e.g. the matched Fio transaction id. */
    meta?: Record<string, unknown>;
  },
  client?: PrismaClient,
) {
  const c = client ?? (await getPrisma());
  const order = await c.paymentOrder.findUnique({
    where: { id: orderId },
    include: { package: true, user: true },
  });
  if (!order || order.status !== PaymentStatus.PENDING) {
    return { ok: false as const, reason: "not_pending" as const };
  }

  const applied = await c.$transaction((tx) => applyConfirmedOrder(tx, order, opts.confirmedById ?? null));

  await audit(
    {
      action:
        opts.source === "admin" ? "admin.payment.confirm" : opts.source === "fio" ? "payment.fio.confirm" : "payment.gopay.confirm",
      success: true,
      userId: order.userId,
      meta: { orderId, source: opts.source, period: applied.kind === "period", ...opts.meta },
    },
    c,
  );

  try {
    await sendPaymentReceiptEmail(
      {
        id: order.id,
        credits: applied.kind === "credits" ? applied.credits : 0,
        amountCzk: order.amountCzk,
        method: order.method,
        variableSymbol: order.variableSymbol,
        user: { email: order.user.email },
      },
      c,
    );
  } catch (err) {
    console.error("[mail] payment receipt email failed:", err);
  }

  return { ok: true as const, applied, userId: order.userId };
}
