import type { PrismaClient } from "@prisma/client";
import { appWallParts, type StatsRow } from "./stats";
import type { AppRange } from "./time";

/**
 * Where the statistics' entry rows come from — the one part of the statistics
 * that is not the same on every branch.
 *
 * This is the `app` branch: entries still live in the `gate.open` audit rows,
 * because `GateEntry` (and `src/lib/gate-entry.ts`) was added on the database
 * branches only. `stena-d1sql`/`stena-psql` override this file wholesale to read
 * `GateEntry` instead; everything else about the statistics — the bucketing,
 * the filter, the page — is shared and identical.
 *
 * What both versions owe the caller is the same `StatsRow` shape (see
 * `stats.ts`), so the page and the export never learn which one they ran on.
 *
 * One caveat that follows from the audit rows being the source here: the log
 * cleanup deletes them by age (`src/lib/log-cleanup.ts`), so on this branch the
 * statistics only reach back as far as the retention window — which is the
 * whole reason `GateEntry` exists. `firstDataYear` below therefore reports what
 * this branch can actually show.
 */

/** Entry rows for one half-open window, in the shape the statistics count. */
export async function fetchOpensInRange(prisma: PrismaClient, range: AppRange): Promise<StatsRow[]> {
  const rows = await prisma.auditLog.findMany({
    where: { action: "gate.open", success: true, createdAt: { gte: range.from, lt: range.to } },
    select: { createdAt: true, userId: true, meta: true, user: { select: { email: true, name: true, role: true } } },
  });

  return rows.map((row) => ({
    ...row,
    // `GateEntry` has this in its own column; an audit row only carries it
    // inside the meta blob, which is where the lock result was written.
    simulated: Boolean((row.meta as { lockResult?: { simulated?: boolean } } | null)?.lockResult?.simulated),
  }));
}

/**
 * The oldest year this branch has anything to show for — entries or the
 * bank-transfer estimate, whichever reaches further back. The year filter
 * offers every year from here to the current one.
 */
export async function firstDataYear(prisma: PrismaClient, now = new Date()): Promise<number> {
  const [entry, estimate] = await Promise.all([
    prisma.auditLog.findFirst({
      where: { action: "gate.open", success: true },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.estimatedEntry.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);

  const years = [entry?.createdAt, estimate?.createdAt]
    .filter((date): date is Date => date instanceof Date)
    .map((date) => appWallParts(date).year);

  return years.length ? Math.min(...years) : appWallParts(now).year;
}
