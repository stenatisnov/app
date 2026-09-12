import type { PrismaClient } from "@prisma/client";
import { PackageKind, Prisma } from "@prisma/client";
import { isAppConstantSymbol } from "./fio-symbol";

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
 *
 * The estimate is *recorded* when the transfer is (`recordEstimatedEntry`,
 * called from the Fio poll) rather than derived on the fly from the transfer's
 * audit row: the log cleanup deletes `AuditLog` wholesale, which used to take
 * the whole estimate history with it. See `EstimatedEntry` in the schema.
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

/** An unmatched transfer, as far as the estimate is concerned. */
export type UnmatchedTransfer = {
  /** Fio's own transaction id — the recording key. */
  fioIdPohyb: string;
  amountCzk: number;
  constantSymbol: string | null;
  /**
   * When we learned about the transfer. Fio reports only a calendar date for
   * a transaction, never a time-of-day (see `FioTransaction.date`), so both
   * the audit row and this row carry the poll instant — which is also the
   * only instant an estimate can honestly be bucketed by.
   */
  createdAt: Date;
};

type EstimatedEntryRow = { fioIdPohyb: string; amountCzk: number; entries: number; createdAt: Date };

/**
 * The price points of one entry, as the catalogue has them *right now* — used
 * only when an estimate is first computed; see `EstimatedEntry.entries` for
 * why the result is then frozen rather than recomputed.
 */
async function loadEntryPriceOptions(prisma: PrismaClient): Promise<EntryPriceOption[]> {
  const packages = await prisma.pricePackage.findMany({
    where: { kind: PackageKind.CREDITS, credits: 1, priceCzk: { gt: 0 } },
    select: { priceCzk: true, credits: true, personType: { select: { name: true } } },
  });
  return entryPriceOptions(packages);
}

/**
 * Estimates one unmatched transfer and remembers the result, so the
 * statistics can show it after the audit log has been cleaned.
 *
 * Skips transfers carrying the app's own constant symbol (KS=1): those are
 * QR-generated payments of ours that merely failed to auto-match (a wrong
 * amount, say), so the app itself will record their entries when they're used
 * — estimating them here as well would double them.
 *
 * Returns the estimate it recorded, or `null` when there was nothing to
 * record. A transfer that plausibly paid for nothing (a rental, a donation)
 * is still recorded, with `entries: 0` — so a later backfill can see it was
 * already considered instead of costing a fresh estimate on every stats view.
 *
 * Never throws on a transfer that is already recorded (the unique index on
 * `fioIdPohyb`): a forced poll and a stats view can race over the same
 * transfer, and that is the only error worth tolerating here.
 */
export async function recordEstimatedEntry(
  txn: UnmatchedTransfer,
  prisma: PrismaClient,
): Promise<EntryEstimate | null> {
  if (!txn.fioIdPohyb || isAppConstantSymbol(txn.constantSymbol)) return null;

  const options = await loadEntryPriceOptions(prisma);
  const estimate = estimateEntriesForAmount(txn.amountCzk, options);
  if (!estimate) return null;

  const row: EstimatedEntryRow = {
    fioIdPohyb: txn.fioIdPohyb,
    amountCzk: Math.trunc(txn.amountCzk),
    entries: estimate.count,
    createdAt: txn.createdAt,
  };
  if (await isAlreadyRecorded(row.fioIdPohyb, prisma)) return estimate;

  try {
    await prisma.estimatedEntry.create({ data: row });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }
  return estimate;
}

async function isAlreadyRecorded(fioIdPohyb: string, prisma: PrismaClient): Promise<boolean> {
  const existing = await prisma.estimatedEntry.findUnique({ where: { fioIdPohyb }, select: { id: true } });
  return existing !== null;
}

/**
 * Seeds the estimates table from the unmatched-payment audit rows still on
 * hand, for transfers recorded before this table existed.
 *
 * Idempotent, and meant to be called before reading the window: a transfer
 * already in the table is left alone, so this is safe to run on every stats
 * view. The window is the one the statistics actually display, which is why
 * it takes `since` rather than walking all of history.
 *
 * This is a *one-time* recovery at best: the audit log cleanup deletes rows
 * wholesale (`LogCleanupSettings`, age-based), so transfers whose audit rows
 * are already gone can't be recovered by anything. From here on the estimate
 * is written at poll time and no longer depends on the log.
 *
 * Historical estimates are computed from the current price list, not the one
 * in force when the transfer arrived — the estimate is a guess either way,
 * and re-guessing once is the whole point of this function.
 */
export async function backfillEstimatedEntries(prisma: PrismaClient, since: Date): Promise<number> {
  const unmatched = await prisma.auditLog.findMany({
    where: { action: "payment.fio.unmatched", createdAt: { gte: since } },
    select: { createdAt: true, meta: true },
  });

  const transfers: UnmatchedTransfer[] = [];
  for (const row of unmatched) {
    const meta = row.meta;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) continue;
    const m = meta as Record<string, unknown>;
    const fioIdPohyb = typeof m.fioIdPohyb === "string" ? m.fioIdPohyb : "";
    if (!fioIdPohyb) continue;
    transfers.push({
      fioIdPohyb,
      amountCzk: Number(m.amountCzk),
      constantSymbol: typeof m.constantSymbol === "string" ? m.constantSymbol : null,
      createdAt: row.createdAt,
    });
  }
  if (transfers.length === 0) return 0;

  const [options, knownRows] = await Promise.all([
    loadEntryPriceOptions(prisma),
    prisma.estimatedEntry.findMany({
      where: { fioIdPohyb: { in: transfers.map((t) => t.fioIdPohyb) } },
      select: { fioIdPohyb: true },
    }),
  ]);
  if (options.length === 0) return 0;

  const known = new Set(knownRows.map((r) => r.fioIdPohyb));
  const rows: EstimatedEntryRow[] = [];
  for (const txn of transfers) {
    if (known.has(txn.fioIdPohyb) || isAppConstantSymbol(txn.constantSymbol)) continue;
    const estimate = estimateEntriesForAmount(txn.amountCzk, options);
    if (!estimate) continue;
    known.add(txn.fioIdPohyb);
    rows.push({
      fioIdPohyb: txn.fioIdPohyb,
      amountCzk: Math.trunc(txn.amountCzk),
      entries: estimate.count,
      createdAt: txn.createdAt,
    });
  }
  if (rows.length === 0) return 0;

  // One statement, not one per row: this runs on a page view. `createMany` on
  // SQLite/D1 has no `skipDuplicates`, which is what the `known` set above is
  // for; the unique index stays the last line of defence.
  try {
    const inserted = await prisma.estimatedEntry.createMany({ data: rows });
    return inserted.count;
  } catch (err) {
    // A poll recording one of these same transfers between the `known` read
    // above and this insert. The statement is atomic on both databases, so
    // nothing was written and the next view gets it right — no reason to fail
    // the whole statistics page over it.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return 0;
    throw err;
  }
}

/**
 * Estimated entries from every recorded unmatched transfer since `since`,
 * **one pseudo-row per estimated entry** so the caller can feed them straight
 * into the same `src/lib/stats.ts` bucket helpers `GateEntry` rows go through
 * — with no second bucketing implementation to keep in sync.
 */
export async function fetchEstimatedEntries(prisma: PrismaClient, since: Date): Promise<{ createdAt: Date }[]> {
  const rows = await prisma.estimatedEntry.findMany({
    where: { createdAt: { gte: since }, entries: { gt: 0 } },
    select: { createdAt: true, entries: true },
  });

  const entries: { createdAt: Date }[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.entries; i++) entries.push({ createdAt: row.createdAt });
  }
  return entries;
}
