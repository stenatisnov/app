import { data } from "react-router";
import type { Route } from "./+types/gopay.webhook";
import { PaymentMethod, PaymentStatus } from "@prisma/client";
import { getPrisma } from "@/lib/db";
import { confirmPaymentOrder } from "@/lib/payments";
import { withLoadContext } from "@/lib/request-context.server";

const PAID_STATES = new Set(["PAID", "PAID_READY", "CONFIRMED", "SUCCESS"]);

/**
 * GoPay payment notification webhook. Once real GoPay checkout is wired up,
 * a successful payment calls this to confirm the order and grant credits
 * (or a period pass) automatically.
 *
 * Body: `{ orderId: string, goPayPaymentId?: string, state: string }`.
 * Only a "paid" state confirms the order; anything else is acknowledged
 * and ignored. No `revalidatePath` equivalent needed — this webhook isn't
 * navigated to, and the pages it would have refreshed (`/`, `/buy`,
 * `/admin/payments`) just pick up the new state on their next visit.
 */
export async function action({ request, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    let body: { orderId?: string; goPayPaymentId?: string; state?: string };
    try {
      body = await request.json();
    } catch {
      return data({ error: "invalid_json" }, { status: 400 });
    }

    const orderId = String(body.orderId || "").trim();
    const state = String(body.state || "").toUpperCase();
    if (!orderId) {
      return data({ error: "missing_orderId" }, { status: 400 });
    }
    if (!PAID_STATES.has(state)) {
      return data({ ok: true, ignored: true, state });
    }

    const prisma = await getPrisma();
    const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } });
    if (!order || order.method !== PaymentMethod.GOPAY) {
      return data({ error: "not_found" }, { status: 404 });
    }
    if (order.status === PaymentStatus.CONFIRMED) {
      return data({ ok: true, alreadyConfirmed: true });
    }

    if (body.goPayPaymentId) {
      await prisma.paymentOrder.update({ where: { id: orderId }, data: { goPayPaymentId: String(body.goPayPaymentId) } });
    }

    const result = await confirmPaymentOrder(orderId, { source: "gopay" });
    return data({ ok: result.ok, reason: result.ok ? undefined : result.reason });
  });
}
