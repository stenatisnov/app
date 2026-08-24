import { PackageKind, PaymentStatus, type Prisma, type PrismaClient, type PeriodPreset } from "@prisma/client";
import { getPrisma } from "./db.server";
import { resolvePeriodBounds } from "./access-pass";
import { audit } from "./audit";
import { sendPaymentReceiptEmail } from "./registration-mail";

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

type ConfirmedOrderResult = { kind: "period"; validTo: Date } | { kind: "credits"; credits: number };

/**
 * Builds the write operations that apply a payment's effects (credits or a
 * period pass) — without executing them, and *without* marking the order
 * CONFIRMED (see `confirmPaymentOrder`, which claims the order atomically
 * before calling this). Cloudflare D1 doesn't support Prisma's interactive
 * transactions (`$transaction(async (tx) => ...)`), only the batch array
 * form (`$transaction([op1, op2, ...])`). Every branch here is decided from
 * `order`/`pkg`, already fetched by the caller before this runs — nothing
 * reads back a value written by an earlier operation in the same batch —
 * so building the whole list upfront and running it as one batch is
 * equivalent to (and D1-safe, unlike) the old `tx.x.y()` sequence.
 */
function planConfirmedOrder(
  prisma: PrismaClient,
  order: ConfirmableOrder,
  /** Fresh-at-confirmation-time FAMILY companions to credit (already capped/classified by the caller) — empty for every other order kind. */
  familyCompanions: { id: string }[] = [],
  /** Fresh-at-confirmation-time Platba (multi-person purchase) recipients to credit, each already re-priced by the caller — empty for every other order kind. */
  platbaItems: { recipientId: string; credits: number }[] = [],
): { operations: Prisma.PrismaPromise<unknown>[]; result: ConfirmedOrderResult } {
  // Platba (multi-person purchase) — checked first since a non-empty
  // platbaItems is the unambiguous signal a plain packageId doesn't give us
  // (a Platba order always has packageId: null). Each item was already
  // re-fetched/re-priced/re-validated fresh by the caller (confirmPaymentOrder)
  // — this function stays a pure, synchronous plan builder, no DB reads of
  // its own (see the docstring above).
  if (platbaItems.length > 0) {
    const operations: Prisma.PrismaPromise<unknown>[] = [];
    let totalCredits = 0;
    for (const item of platbaItems) {
      totalCredits += item.credits;
      if (item.recipientId === "self") {
        operations.push(
          prisma.user.update({ where: { id: order.userId }, data: { credits: { increment: item.credits } } }),
          prisma.creditLedger.create({
            data: {
              userId: order.userId,
              delta: item.credits,
              reason: "payment_confirmed",
              meta: { orderId: order.id, method: order.method, platba: true },
            },
          }),
        );
      } else {
        operations.push(
          prisma.dependent.update({ where: { id: item.recipientId }, data: { credits: { increment: item.credits } } }),
          prisma.creditLedger.create({
            data: {
              userId: order.userId,
              dependentId: item.recipientId,
              delta: item.credits,
              reason: "payment_confirmed_dependent",
              meta: { orderId: order.id, method: order.method, platba: true },
            },
          }),
        );
      }
    }
    return { operations, result: { kind: "credits", credits: totalCredits } };
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

    return {
      operations: [
        prisma.userAccessPass.create({
          data: {
            userId: order.userId,
            packageId: pkg.id,
            paymentOrderId: order.id,
            validFrom: bounds.validFrom,
            validTo: bounds.validTo,
            label: bounds.label,
          },
        }),
        prisma.creditLedger.create({
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
        }),
      ],
      result: { kind: "period", validTo: bounds.validTo },
    };
  }

  if (pkg?.kind === PackageKind.FAMILY) {
    const operations: Prisma.PrismaPromise<unknown>[] = [
      prisma.user.update({ where: { id: order.userId }, data: { credits: { increment: order.credits } } }),
      prisma.creditLedger.create({
        data: {
          userId: order.userId,
          delta: order.credits,
          reason: "payment_confirmed",
          meta: { orderId: order.id, method: order.method, family: true },
        },
      }),
    ];
    // familyCompanions is already fresh-classified and capped by the caller
    // (confirmPaymentOrder) — this function stays a pure, synchronous plan
    // builder, no DB reads of its own (see the docstring above).
    for (const dep of familyCompanions) {
      operations.push(
        prisma.dependent.update({ where: { id: dep.id }, data: { credits: { increment: 1 } } }),
        prisma.creditLedger.create({
          data: {
            userId: order.userId,
            dependentId: dep.id,
            delta: 1,
            reason: "payment_confirmed_dependent",
            meta: { orderId: order.id, method: order.method, family: true },
          },
        }),
      );
    }
    return { operations, result: { kind: "credits", credits: order.credits } };
  }

  if (order.dependentId) {
    return {
      operations: [
        prisma.dependent.update({
          where: { id: order.dependentId },
          data: { credits: { increment: order.credits } },
        }),
        prisma.creditLedger.create({
          data: {
            userId: order.userId,
            dependentId: order.dependentId,
            delta: order.credits,
            reason: "payment_confirmed_dependent",
            meta: { orderId: order.id, method: order.method },
          },
        }),
      ],
      result: { kind: "credits", credits: order.credits },
    };
  }

  return {
    operations: [
      prisma.user.update({
        where: { id: order.userId },
        data: { credits: { increment: order.credits } },
      }),
      prisma.creditLedger.create({
        data: {
          userId: order.userId,
          delta: order.credits,
          reason: "payment_confirmed",
          meta: { orderId: order.id, method: order.method },
        },
      }),
    ],
    result: { kind: "credits", credits: order.credits },
  };
}

/**
 * Confirms a pending payment order, granting either credits or a period
 * access pass. Called by the admin "confirm QR payment" action, by the
 * (simulated-until-wired) GoPay checkout / webhook, and by the Fio bank
 * API poll (`fio.ts`) matching an incoming transfer to its variable symbol —
 * three independent call sites that can race the same `orderId` (e.g. an
 * admin clicking "confirm" at the same moment the Fio poll matches the same
 * transfer).
 *
 * The initial `status !== PENDING` check below is just a cheap early-out; the
 * actual guard against a double confirm is the `updateMany` further down,
 * which re-asserts `status: PENDING` in its `WHERE` clause. That single
 * statement is atomic (same reasoning as `openGateForUser`'s credit claim in
 * gate.ts), so of two concurrent calls, only one can ever flip the order to
 * CONFIRMED — the other's `updateMany` matches zero rows and reports
 * `not_pending`, instead of both proceeding to double-apply `plan.operations`
 * (double credits, a duplicate access pass, two receipt emails).
 *
 * Takes an explicit `client`, defaulting to a fresh `getPrisma()` — the D1
 * binding lives on `context.cloudflare.env`, reachable only through
 * `getLoadContext()`, which isn't available outside the normal fetch
 * request lifecycle. The scheduled Fio poll (`workers/app.ts`) builds its
 * own client the same way the backup jobs do and threads it through instead.
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
  const prisma = client ?? (await getPrisma());
  const order = await prisma.paymentOrder.findUnique({
    where: { id: orderId },
    include: { package: true, user: true },
  });
  if (!order || order.status !== PaymentStatus.PENDING) {
    return { ok: false as const, reason: "not_pending" as const };
  }

  // Re-classify FAMILY companions fresh right before planning — a
  // companion's category (or existence) may have changed since purchase —
  // and re-cap defensively. A real DB read, so it happens here rather than
  // inside planConfirmedOrder, which stays a pure synchronous plan builder.
  let familyCompanions: { id: string }[] = [];
  if (order.package?.kind === PackageKind.FAMILY) {
    const requestedIds = Array.isArray(order.familyCompanionIds)
      ? order.familyCompanionIds.filter((id): id is string => typeof id === "string")
      : [];
    if (requestedIds.length > 0) {
      const dependents = await prisma.dependent.findMany({
        where: { id: { in: requestedIds }, parentUserId: order.userId },
        include: { personType: true },
      });
      const adults = dependents.filter((d) => !d.personType?.isChildCategory).slice(0, FAMILY_ADULT_CAP);
      const children = dependents.filter((d) => d.personType?.isChildCategory).slice(0, FAMILY_CHILD_CAP);
      familyCompanions = [...adults, ...children];
    }
  }

  // Re-resolve Platba (multi-person purchase) items fresh right before
  // planning — never trust the credits/price captured at purchase time, and
  // a dependent recipient's ownership could theoretically have changed since
  // purchase. A real DB read, so it happens here rather than inside
  // planConfirmedOrder, which stays a pure synchronous plan builder.
  const platbaItems: { recipientId: string; credits: number }[] = [];
  const requestedItems = Array.isArray(order.items)
    ? order.items.filter(
        (i): i is { recipientId: string; packageId: string } =>
          typeof i === "object" &&
          i !== null &&
          typeof (i as Record<string, unknown>).recipientId === "string" &&
          typeof (i as Record<string, unknown>).packageId === "string",
      )
    : [];
  if (requestedItems.length > 0) {
    const packages = await prisma.pricePackage.findMany({ where: { id: { in: requestedItems.map((i) => i.packageId) } } });
    const dependentIds = requestedItems.filter((i) => i.recipientId !== "self").map((i) => i.recipientId);
    const dependents = dependentIds.length
      ? await prisma.dependent.findMany({ where: { id: { in: dependentIds }, parentUserId: order.userId } })
      : [];
    const dependentIdSet = new Set(dependents.map((d) => d.id));

    for (const item of requestedItems) {
      const pkg = packages.find((p) => p.id === item.packageId);
      if (!pkg) continue;
      if (item.recipientId !== "self" && !dependentIdSet.has(item.recipientId)) continue; // dependent removed/reassigned since purchase
      platbaItems.push({ recipientId: item.recipientId, credits: pkg.credits });
    }
  }

  // Built (and allowed to throw, e.g. on PERIOD_PACKAGE_NOT_SUPPORTED_FOR_DEPENDENT)
  // before the claim below, so a rejected plan never leaves the order
  // stuck CONFIRMED without its effects applied.
  const plan = planConfirmedOrder(prisma, order, familyCompanions, platbaItems);
  const confirmedById = opts.confirmedById ?? null;

  const claimed = await prisma.paymentOrder.updateMany({
    where: { id: order.id, status: PaymentStatus.PENDING },
    data: { status: PaymentStatus.CONFIRMED, confirmedAt: new Date(), confirmedById },
  });
  if (claimed.count === 0) {
    return { ok: false as const, reason: "not_pending" as const };
  }

  let applied: ConfirmedOrderResult;
  try {
    await prisma.$transaction(plan.operations);
    applied = plan.result;
  } catch (err) {
    // The claim above already flipped status -> CONFIRMED; if applying the
    // actual credit/pass effects then fails, roll the claim back to PENDING
    // rather than leaving an order marked confirmed with nothing granted —
    // same claim-then-compensate-on-failure shape as openGateForUser's
    // lock-failure rollback in gate.ts.
    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: PaymentStatus.PENDING, confirmedAt: null, confirmedById: null },
    });
    throw err;
  }

  await audit(
    {
      action:
        opts.source === "admin" ? "admin.payment.confirm" : opts.source === "fio" ? "payment.fio.confirm" : "payment.gopay.confirm",
      success: true,
      userId: order.userId,
      meta: { orderId, source: opts.source, period: applied.kind === "period", ...opts.meta },
    },
    prisma,
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
      client,
    );
  } catch (err) {
    console.error("[mail] payment receipt email failed:", err);
  }

  return { ok: true as const, applied, userId: order.userId };
}
