import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { PaymentMethod, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { confirmPaymentOrder } from "@/lib/payments";

const PAID_STATES = new Set(["PAID", "PAID_READY", "CONFIRMED", "SUCCESS"]);

/**
 * GoPay payment notification webhook. Once real GoPay checkout is wired up,
 * a successful payment calls this to confirm the order and grant credits
 * (or a period pass) automatically.
 *
 * Body: `{ orderId: string, goPayPaymentId?: string, state: string }`.
 * Only a "paid" state confirms the order; anything else is acknowledged
 * and ignored.
 */
export async function POST(req: NextRequest) {
  let body: { orderId?: string; goPayPaymentId?: string; state?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const orderId = String(body.orderId || "").trim();
  const state = String(body.state || "").toUpperCase();
  if (!orderId) {
    return NextResponse.json({ error: "missing_orderId" }, { status: 400 });
  }
  if (!PAID_STATES.has(state)) {
    return NextResponse.json({ ok: true, ignored: true, state });
  }

  const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } });
  if (!order || order.method !== PaymentMethod.GOPAY) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (order.status === PaymentStatus.CONFIRMED) {
    return NextResponse.json({ ok: true, alreadyConfirmed: true });
  }

  if (body.goPayPaymentId) {
    await prisma.paymentOrder.update({ where: { id: orderId }, data: { goPayPaymentId: String(body.goPayPaymentId) } });
  }

  const result = await confirmPaymentOrder(orderId, { source: "gopay" });
  if (result.ok) {
    revalidatePath("/");
    revalidatePath("/buy");
    revalidatePath("/admin/payments");
  }

  return NextResponse.json({ ok: result.ok, reason: result.ok ? undefined : result.reason });
}
