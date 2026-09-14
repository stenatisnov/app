import type { PrismaClient } from "@prisma/client";
import { fetchGateEntriesWithUser } from "./gate-entry";
import { appWallParts, type StatsRow } from "./stats";
import type { AppRange } from "./time";

/**
 * Where the statistics' entry rows come from — the one part of the statistics
 * that is not the same on every branch.
 *
 * This is the `stena-d1sql` branch: entries come from `GateEntry`, which is
 * written alongside the `gate.open` audit row at every successful open and is
 * never cleaned up (`src/lib/gate-entry.ts` explains why it exists at all — the
 * log cleanup deletes audit history by age, which used to erase these
 * statistics with it). `app` overrides this file to read the audit rows
 * directly, because it doesn't carry the `GateEntry` model; everything else
 * about the statistics — the bucketing, the filter, the page — is shared.
 *
 * What both versions owe the caller is the same `StatsRow` shape (see
 * `stats.ts`), so the page and the export never learn which one they ran on.
 * `fetchGateEntriesWithUser` already returns exactly that shape, `simulated`
 * included — hence the thin wrapper.
 */

/** Entry rows for one half-open window, in the shape the statistics count. */
export async function fetchOpensInRange(prisma: PrismaClient, range: AppRange): Promise<StatsRow[]> {
  return fetchGateEntriesWithUser(prisma, { createdAt: { gte: range.from, lt: range.to } });
}

/**
 * The oldest year this branch has anything to show for — entries or the
 * bank-transfer estimate, whichever reaches further back. The year filter
 * offers every year from here to the current one.
 */
export async function firstDataYear(prisma: PrismaClient, now = new Date()): Promise<number> {
  const [entry, estimate] = await Promise.all([
    prisma.gateEntry.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.estimatedEntry.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);

  const years = [entry?.createdAt, estimate?.createdAt]
    .filter((date): date is Date => date instanceof Date)
    .map((date) => appWallParts(date).year);

  return years.length ? Math.min(...years) : appWallParts(now).year;
}
