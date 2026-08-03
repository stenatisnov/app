import { PackageKind, PaymentStatus, type Prisma, type PeriodPreset } from "@prisma/client";
import { prisma } from "./db";
import { resolvePeriodBounds } from "./access-pass";
import { audit } from "./audit";

type Tx = Prisma.TransactionClient;

type ConfirmableOrder = {
  id: string;
  userId: string;
  credits: number;
  method: string;
  note: string | null;
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

  const pkg = order.package;
  const isPeriodOrder =
    pkg?.kind === PackageKind.PERIOD || (order.credits === 0 && Boolean(order.note?.startsWith("period:")));

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
 * access pass. Called by the admin "confirm QR payment" action and by the
 * (simulated-until-wired) GoPay checkout / webhook.
 */
export async function confirmPaymentOrder(
  orderId: string,
  opts: { confirmedById?: string | null; source: "admin" | "gopay" },
) {
  const order = await prisma.paymentOrder.findUnique({ where: { id: orderId }, include: { package: true } });
  if (!order || order.status !== PaymentStatus.PENDING) {
    return { ok: false as const, reason: "not_pending" as const };
  }

  const applied = await prisma.$transaction((tx) => applyConfirmedOrder(tx, order, opts.confirmedById ?? null));

  await audit({
    action: opts.source === "admin" ? "admin.payment.confirm" : "payment.gopay.confirm",
    success: true,
    userId: order.userId,
    meta: { orderId, source: opts.source, period: applied.kind === "period" },
  });

  return { ok: true as const, applied, userId: order.userId };
}
