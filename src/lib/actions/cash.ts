import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getPrisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { reportEetSale } from "@/lib/eet";
import { sendPaymentReceiptEmail } from "@/lib/registration-mail";
import { getSessionUser } from "@/lib/session.server";

/**
 * ZoET's own wording for a sale accepted while the register can't reach the
 * tax authority ("evidence v jiném režimu") — used on the receipt whenever
 * `reportEetSale` didn't come back with a real POK (disabled integration,
 * queued for retry, or an outright failure), so the receipt still always
 * carries *some* value for this field instead of a blank.
 */
const FALLBACK_POK = "Evidováno v jiném režimu";

export type RecordCashPaymentResult = { ok: true; pok: string } | { ok: false; error: "validation" | "auth" };

/**
 * Staff-facing "Cash" menu — logs a walk-in cash sale with no associated
 * member/PaymentOrder (e.g. a one-off entry or on-the-spot sale paid in
 * cash). Always attempts EET registration since it's real revenue, exactly
 * like a confirmed in-app payment — see `confirmPaymentOrder` for the
 * equivalent QR/GoPay/Fio flow this deliberately mirrors.
 */
export async function recordCashPaymentAction(formData: FormData, request: Request): Promise<RecordCashPaymentResult> {
  const staffUser = await getSessionUser(request);
  if (!staffUser) return { ok: false, error: "auth" };

  const amountCzk = Math.round(Number(formData.get("amountCzk") || 0));
  const emailRaw = String(formData.get("email") || "").trim();
  if (!Number.isFinite(amountCzk) || amountCzk <= 0) return { ok: false, error: "validation" };
  if (emailRaw && !z.string().email().safeParse(emailRaw).success) return { ok: false, error: "validation" };
  const email = emailRaw || null;

  const prisma = await getPrisma();
  const reference = `cash-${randomBytes(16).toString("hex")}`;

  await audit(
    { action: "payment.cash.record", success: true, userId: staffUser.id, meta: { reference, amountCzk, email } },
    prisma,
  );

  const eetResult = await reportEetSale(reference, amountCzk);
  const pok = eetResult.pok ?? FALLBACK_POK;
  await audit(
    {
      action: "payment.eet.report",
      success: eetResult.ok,
      userId: staffUser.id,
      meta: { source: "cash", reference, amountCzk, pok: eetResult.pok, queued: eetResult.queued, error: eetResult.error },
    },
    prisma,
  );

  if (email) {
    try {
      await sendPaymentReceiptEmail(
        { id: reference, credits: 0, amountCzk, method: "CASH", variableSymbol: null, pok, user: { email } },
        prisma,
      );
    } catch (err) {
      console.error("[mail] cash payment receipt email failed:", err);
    }
  }

  return { ok: true, pok };
}
