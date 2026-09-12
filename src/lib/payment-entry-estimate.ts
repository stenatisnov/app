import type { PrismaClient } from "@prisma/client";
import { PackageKind } from "@prisma/client";
import { isAppConstantSymbol } from "./fio";

/**
 * Estimated gate entries paid for by a bank transfer that never went through
 * the app.
 *
 * Every unmatched incoming transfer (`payment.fio.unmatched`) is real money
 * the club received, and in most cases the payer has no account here at all
 * — which is why it couldn't be matched in the first place. There is then no
 * other trace of their visit: nothing gets credited, nobody opens the gate
 * through the app, and `GateEntry` records nothing. The transfer is the only
 * evidence the visit happened, so the statistics estimate how many entries
 * the amount paid for from the price list alone.
 *
 * This is a guess by construction. The amount says nothing about how many
 * people it covered, in which categories, or whether it also included
 * something that isn't an entry at all (harness rental, a membership fee).
 * That is why these rows are never mixed into `GateEntry`: the caller
 * renders them as their own, separately labelled series.
 */

export type EntryPriceOption = { label: string; unitPriceCzk: number };

export type EntryEstimate = {
  count: number;
  breakdown: { unitPriceCzk: number; label: string; count: number }[];
  /** Part of the amount no combination of single entries accounts for — a rental or a different price, not an entry. */
  unexplainedCzk: number;
};

/**
 * A price point this far below the dearest one isn't a price of a single
 * entry — see `entryPriceOptions`.
 */
const MIN_PRICE_RATIO = 0.25;

/**
 * The price of one entry, derived from the catalogue: a CREDITS package that
 * sells exactly **one** entry is one price point, per person type — the
 * ceník's "dítě 100, senior/student 125, dospělý 150".
 *
 * Only `credits === 1` packages count. A 10-pack's `priceCzk / credits` is
 * a real price per entry, but only for someone who bought the whole pack,
 * and those are regulars who go through the app anyway (and are therefore
 * excluded from this estimate by their constant symbol) — while the
 * transfers left to explain here are ad-hoc single visits at the ceník
 * price. The pack's marginal price is also always the cheaper one, so it
 * would only ever pull the estimate up. PERIOD and FAMILY packages are
 * skipped too: a period pass has no per-entry price at all, and a FAMILY
 * package covers a fixed companion shape rather than a per-entry price.
 *
 * Points far below the dearest one are dropped as well. Nothing in the
 * catalogue stops a placeholder price (a test package at 1 Kč, say), and
 * such a coin would make *every* amount exactly reachable: the split below
 * would then explain a 150 Kč transfer as 125 + 25×1 instead of one entry.
 *
 * Deliberately reads the whole catalogue, not just `active` packages: a
 * price point that has been deactivated since was still the price someone
 * paid when their transfer arrived.
 */
export function entryPriceOptions(
  packages: { priceCzk: number; credits: number; personType: { name: string } | null }[],
): EntryPriceOption[] {
  const byPrice = new Map<number, EntryPriceOption>();
  for (const pkg of packages) {
    if (pkg.credits !== 1 || !Number.isFinite(pkg.priceCzk) || pkg.priceCzk <= 0) continue;
    const unitPriceCzk = Math.round(pkg.priceCzk);
    if (unitPriceCzk <= 0 || byPrice.has(unitPriceCzk)) continue;
    byPrice.set(unitPriceCzk, { unitPriceCzk, label: pkg.personType?.name ?? "" });
  }
  const options = [...byPrice.values()].sort((a, b) => a.unitPriceCzk - b.unitPriceCzk);
  const dearest = options.at(-1)?.unitPriceCzk ?? 0;
  return options.filter((o) => o.unitPriceCzk >= dearest * MIN_PRICE_RATIO);
}

/** Guards against a mis-keyed transfer (an extra zero) blowing up the table below — no plausible stack of single entries reaches this. */
const MAX_AMOUNT_CZK = 100_000;
/**
 * How much of the amount may be left unexplained — a payer rounding up, a
 * price that has changed since, a small extra on top of the entries. A
 * genuinely unrelated payment (a rental only, a donation) tends to leave a
 * remainder past this, and is then reported as unexplained rather than
 * forced into entries.
 */
const MAX_UNEXPLAINED_CZK = 500;

/**
 * Splits `amountCzk` into a whole number of entries priced from `options`,
 * preferring the explanation with the *fewest* entries.
 *
 * Fewest entries is deliberate, and the only tie-break that can't be
 * resolved from the price list: 300 Kč is 3 children or 2 adults, and
 * nothing in the transfer says which. An estimate that can only undershoot
 * is the safer half of the guess — the operator sees the number labelled as
 * an estimate either way, and understating visits is a smaller error than
 * inventing them. Change this preference here if the opposite error is
 * preferable; nothing else depends on it.
 *
 * Returns `null` when there is nothing to estimate from (no price points, a
 * nonsensical amount) — the caller then simply contributes no entries.
 */
export function estimateEntriesForAmount(amountCzk: number, options: EntryPriceOption[]): EntryEstimate | null {
  const denoms = [...new Set(options.map((o) => o.unitPriceCzk))]
    .filter((p) => Number.isInteger(p) && p > 0)
    .sort((a, b) => a - b);
  const amount = Math.trunc(amountCzk);
  if (denoms.length === 0 || !Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT_CZK) return null;

  // minEntries[sum] = fewest single entries adding up to exactly `sum`,
  // Infinity when no combination does — an unbounded knapsack over the
  // price points.
  const minEntries = new Array<number>(amount + 1).fill(Infinity);
  minEntries[0] = 0;
  for (let sum = 1; sum <= amount; sum++) {
    for (const d of denoms) {
      if (d > sum) break;
      const rest = minEntries[sum - d];
      if (rest + 1 < minEntries[sum]) minEntries[sum] = rest + 1;
    }
  }

  // Largest explainable sum below the amount, i.e. the smallest remainder.
  let explained = 0;
  for (let sum = amount; sum >= Math.max(0, amount - MAX_UNEXPLAINED_CZK); sum--) {
    if (minEntries[sum] !== Infinity) {
      explained = sum;
      break;
    }
  }

  // Walk the table back to recover which price points made up `explained`.
  const used = new Map<number, number>();
  for (let sum = explained; sum > 0; ) {
    const hit = denoms.find((d) => d <= sum && minEntries[sum - d] !== Infinity && minEntries[sum - d] + 1 === minEntries[sum]);
    if (hit === undefined) break;
    used.set(hit, (used.get(hit) ?? 0) + 1);
    sum -= hit;
  }
  const breakdown = [...used.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([unitPriceCzk, count]) => ({
      unitPriceCzk,
      label: options.find((o) => o.unitPriceCzk === unitPriceCzk)?.label ?? "",
      count,
    }));

  return { count: minEntries[explained], breakdown, unexplainedCzk: amount - explained };
}

/**
 * Estimated entries from every unmatched transfer since `since`, **one
 * pseudo-row per estimated entry** so the caller can feed them straight into
 * the same `src/lib/stats.ts` bucket helpers `GateEntry` rows go through —
 * with no second bucketing implementation to keep in sync.
 *
 * Deliberately skips transfers carrying the app's own constant symbol
 * (KS=1): those are QR-generated payments of ours that merely failed to
 * auto-match (a wrong amount, say), so the app itself will record their
 * entries when they're used — counting them here as well would double them.
 */
export async function fetchEstimatedEntries(prisma: PrismaClient, since: Date): Promise<{ createdAt: Date }[]> {
  const [packages, unmatched] = await Promise.all([
    prisma.pricePackage.findMany({
      where: { kind: PackageKind.CREDITS, credits: 1, priceCzk: { gt: 0 } },
      select: { priceCzk: true, credits: true, personType: { select: { name: true } } },
    }),
    // The poll time is the only time-of-day we get: Fio reports a calendar
    // date for a transaction, never a time (see `FioTransaction.date`).
    prisma.auditLog.findMany({
      where: { action: "payment.fio.unmatched", createdAt: { gte: since } },
      select: { createdAt: true, meta: true },
    }),
  ]);

  const options = entryPriceOptions(packages);
  if (options.length === 0) return [];

  const entries: { createdAt: Date }[] = [];
  for (const row of unmatched) {
    const meta = row.meta;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) continue;
    const m = meta as Record<string, unknown>;
    if (isAppConstantSymbol(typeof m.constantSymbol === "string" ? m.constantSymbol : null)) continue;

    const amount = Number(m.amountCzk);
    const estimate = estimateEntriesForAmount(amount, options);
    if (!estimate) continue;
    for (let i = 0; i < estimate.count; i++) entries.push({ createdAt: row.createdAt });
  }
  return entries;
}
