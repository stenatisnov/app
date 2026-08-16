import { PackageKind, PaymentMethod, PaymentStatus } from "@prisma/client";
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

  // Dependents (companions) are credits-only — buying a PERIOD pass "for" one isn't supported.
  let dependentName: string | null = null;
  if (dependentId) {
    if (pkg.kind === PackageKind.PERIOD) return { error: "person_type" as const };
    const dependent = await prisma.dependent.findFirst({ where: { id: dependentId, parentUserId: user.id } });
    if (!dependent || dependent.personTypeId !== pkg.personTypeId) return { error: "person_type" as const };
    dependentName = dependent.name;
  } else if (user.personTypeId !== pkg.personTypeId) {
    return { error: "person_type" as const };
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
      dependentId,
      packageId: pkg.id,
      method: method === "GOPAY" ? PaymentMethod.GOPAY : PaymentMethod.QR,
      status: PaymentStatus.PENDING,
      credits: pkg.kind === PackageKind.PERIOD ? 0 : pkg.credits,
      amountCzk: pkg.priceCzk,
      variableSymbol: vs,
      note: pkg.kind === PackageKind.PERIOD ? `period:${pkg.periodPreset || "CUSTOM"}` : null,
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
      pkg.kind === PackageKind.CREDITS
        ? `Platba za ${pkg.credits} ${czVstupu(pkg.credits)}`
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
