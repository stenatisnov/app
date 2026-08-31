import { getEetSettingsStored, type EetSettings } from "./settings";

export type EetReportResult = { ok: boolean; pok?: string; queued?: boolean; error?: string };

/**
 * Reports a confirmed payment to the separate "eet" Worker, which owns the
 * actual signed EET 2.0 submission and its own D1-backed retry queue — this
 * call is a single best-effort attempt, not a retry loop. `reference`
 * should be the PaymentOrder's own id: stable, unique, and exactly what the
 * eet Worker uses to avoid double-registering the same sale on a repeat call.
 *
 * A disabled integration, or one that can't be reached at all, both return
 * `ok: true` here (nothing more this call can do) — callers are expected to
 * treat this as a non-critical side effect of payment confirmation, same as
 * the receipt email, never something that blocks crediting the payer.
 */
export async function reportEetSale(reference: string, amountCzk: number, settings?: EetSettings): Promise<EetReportResult> {
  const eet = settings ?? (await getEetSettingsStored());
  if (!eet.enabled || !eet.endpoint) return { ok: true };

  try {
    const res = await fetch(`${eet.endpoint.replace(/\/+$/, "")}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${eet.token}` },
      body: JSON.stringify({ reference, amountCzk }),
    });
    const data = await res.json().catch(() => ({}) as Record<string, unknown>);

    if (res.status === 200 && typeof data.pok === "string") return { ok: true, pok: data.pok };
    if (res.status === 202) return { ok: true, queued: true };
    return { ok: false, error: typeof data.error === "string" ? data.error : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "eet request failed" };
  }
}
