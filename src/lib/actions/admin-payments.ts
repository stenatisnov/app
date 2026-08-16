import { PaymentStatus } from "@prisma/client";
import { getPrisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getSessionUser } from "@/lib/session.server";
import { confirmPaymentOrder } from "@/lib/payments";

// ---------------------------------------------------------------------------
// Admin — credits & payments
// ---------------------------------------------------------------------------

export async function adminConfirmPaymentAction(orderId: string, request: Request) {
  const actor = await getSessionUser(request);
  const result = await confirmPaymentOrder(orderId, { source: "admin", confirmedById: actor?.id });
  if (!result.ok) return;
}

/** Cancels a pending payment order that's never going to be paid (or was created in error) — soft-deleted via PaymentStatus.CANCELLED, not removed, so it stays in the audit trail. */
export async function adminCancelPaymentAction(orderId: string, request: Request) {
  const prisma = await getPrisma();
  const actor = await getSessionUser(request);
  const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== PaymentStatus.PENDING) return;

  await prisma.paymentOrder.update({ where: { id: orderId }, data: { status: PaymentStatus.CANCELLED } });
  await audit({
    action: "admin.payment.cancel",
    success: true,
    userId: order.userId,
    meta: { orderId, amountCzk: order.amountCzk, method: order.method, variableSymbol: order.variableSymbol, by: actor?.id },
  });
}
