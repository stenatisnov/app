/**
 * Recognising the app's own payments by their constant symbol.
 *
 * Deliberately its own module, with no imports at all: both `fio.ts` (which
 * writes the transfers) and `payment-entry-estimate.ts` (which estimates
 * entries from them) need this, and the estimate module is imported *by*
 * `fio.ts` — keeping the helper here is what stops those two from forming an
 * import cycle.
 */

/**
 * True when a constant symbol (as reported by Fio, or read back out of an
 * AuditLog row's meta) identifies one of the app's own QR-generated
 * payments — see `createPaymentOrderAction`'s `buildSpdPayload({
 * constantSymbol: "1" })`. Compares numerically, not as a string: Fio
 * reports constant symbols zero-padded to their canonical 4 digits
 * ("0001"), even though the SPD payload we generate carries the unpadded
 * "1" — a strict `=== "1"` here previously misclassified every one of the
 * app's own payments as an outside-app transfer whenever it fell through
 * to the unmatched path (wrong "Kontrola plateb" section, and wrongly
 * ad-hoc EET-reported on top).
 */
export function isAppConstantSymbol(value: string | null | undefined): boolean {
  if (!value) return false;
  return Number(value.replace(/\D/g, "")) === 1;
}
