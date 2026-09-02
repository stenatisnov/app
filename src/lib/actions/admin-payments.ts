import { z } from "zod";
import { PaymentStatus } from "@prisma/client";
import { getPrisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getSessionUser, requireStaffOrAbove } from "@/lib/session.server";
import { confirmPaymentOrder } from "@/lib/payments";
import { reportEetSale, FALLBACK_POK } from "@/lib/eet";
import { sendPaymentReceiptEmail } from "@/lib/registration-mail";

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

export type SendUnmatchedReceiptResult = { ok: true; email: string } | { ok: false; error: "validation" | "not_found" | "send_failed" };

/**
 * Staff-triggered receipt for an unmatched Fio transfer ("Platby převodem
 * mimo aplikaci" on Kontrola plateb) — for when the payer's own transfer
 * note didn't include an email (fio.ts already sends one automatically
 * when it does) but staff learns it some other way afterward (in person,
 * by phone). `auditLogId` identifies the specific `payment.fio.unmatched`
 * row to pull the reference/amount from. reportEetSale is idempotent per
 * reference, so re-running it here for an already-registered transaction
 * just returns the existing POK instead of re-submitting to EET.
 */
export async function adminSendUnmatchedReceiptAction(
  formData: FormData,
  request: Request,
  locale: string,
): Promise<SendUnmatchedReceiptResult> {
  const staffUser = await requireStaffOrAbove(request, locale);

  const auditLogId = String(formData.get("auditLogId") || "");
  const email = String(formData.get("email") || "").trim();
  if (!auditLogId || !z.string().email().safeParse(email).success) return { ok: false, error: "validation" };

  const prisma = await getPrisma();
  const row = await prisma.auditLog.findUnique({ where: { id: auditLogId } });
  if (!row || row.action !== "payment.fio.unmatched") return { ok: false, error: "not_found" };

  const meta = (row.meta ?? {}) as Record<string, unknown>;
  const fioIdPohyb = meta.fioIdPohyb != null ? String(meta.fioIdPohyb) : "";
  const amountCzk = Number(meta.amountCzk);
  if (!fioIdPohyb || !Number.isFinite(amountCzk) || amountCzk <= 0) return { ok: false, error: "not_found" };

  const reference = `fio-${fioIdPohyb}`;
  const eetResult = await reportEetSale(reference, amountCzk);
  const pok = eetResult.pok ?? FALLBACK_POK;
  await audit({
    action: "payment.eet.report",
    success: eetResult.ok,
    userId: staffUser.id,
    meta: { source: "fio-unmatched-manual", reference, amountCzk, pok: eetResult.pok, queued: eetResult.queued, error: eetResult.error },
  });

  try {
    await sendPaymentReceiptEmail(
      { id: reference, credits: 0, amountCzk, method: "FIO", variableSymbol: null, pok, user: { email } },
      prisma,
    );
  } catch (err) {
    console.error("[mail] manual fio ad-hoc receipt email failed:", err);
    return { ok: false, error: "send_failed" };
  }

  await audit({
    action: "admin.payment.send_receipt",
    success: true,
    userId: staffUser.id,
    meta: { reference, amountCzk, email, pok },
  });

  return { ok: true, email };
}
