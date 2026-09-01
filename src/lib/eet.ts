import { getEetSettingsStored, type EetSettings } from "./settings";

export type EetReportResult = { ok: boolean; pok?: string; queued?: boolean; error?: string };

/**
 * ZoET's own wording for a sale accepted while the register can't reach the
 * tax authority ("evidence v jiném režimu") — used on receipts whenever
 * `reportEetSale` didn't come back with a real POK (queued for retry, or an
 * outright failure), so a receipt for an attempted report still always
 * carries *some* value for this field instead of a blank.
 */
export const FALLBACK_POK = "Evidováno v jiném režimu";

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
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (res.status === 200 && typeof data.pok === "string") return { ok: true, pok: data.pok };
    if (res.status === 202) return { ok: true, queued: true };
    return { ok: false, error: typeof data.error === "string" ? data.error : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "eet request failed" };
  }
}

/** One row of the eet Worker's own `EetSale` retry-queue table, as returned by `GET /admin/data`. */
export type EetSaleRow = {
  id: number;
  reference: string;
  amountCzk: string;
  status: "PENDING" | "SENT" | "REJECTED" | "EXPIRED";
  eic: string;
  idJednotky: string;
  idPokl: string;
  datTrzby: string;
  pok: string | null;
  test: number | null;
  attempts: number;
  lastErrorCode: number | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EetAdminDataResult = { ok: true; rows: EetSaleRow[] } | { ok: false; error: string };

/**
 * Reads the eet Worker's own retry-queue rows (`GET /admin/data`) for the
 * Administrace → EET page — the same data its standalone `/admin` shell
 * shows, just embedded here so staff don't need a second login/token entry.
 * Returns an explicit error string rather than throwing: a disabled/
 * unconfigured integration or an unreachable Worker are both expected,
 * reportable states for this page, not exceptional ones.
 */
export async function fetchEetAdminData(settings?: EetSettings): Promise<EetAdminDataResult> {
  const eet = settings ?? (await getEetSettingsStored());
  if (!eet.enabled || !eet.endpoint) return { ok: false, error: "not_configured" };

  try {
    const res = await fetch(`${eet.endpoint.replace(/\/+$/, "")}/admin/data`, {
      headers: { Authorization: `Bearer ${eet.token}` },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { rows?: EetSaleRow[] };
    return { ok: true, rows: Array.isArray(data.rows) ? data.rows : [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "eet request failed" };
  }
}
