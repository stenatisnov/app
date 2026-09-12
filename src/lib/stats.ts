import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { APP_TZ } from "./time";

function appWallParts(date = new Date()) {
  const [y, m, d, h] = formatInTimeZone(date, APP_TZ, "yyyy|MM|dd|HH").split("|");
  return {
    year: Number(y),
    month: Number(m),
    day: Number(d),
    hour: Number(h),
    ymd: `${y}-${m}-${d}`,
    ym: `${y}-${m}`,
  };
}

function daysInAppMonth(date = new Date()): number {
  const { year, month } = appWallParts(date);
  return new Date(year, month, 0).getDate();
}

/** Start of the current Europe/Prague calendar year, as a UTC instant — used to scope DB queries. */
export function startOfAppYear(date = new Date()): Date {
  const { year } = appWallParts(date);
  return fromZonedTime(`${year}-01-01T00:00:00`, APP_TZ);
}

/** `days` back from `now` — used for the rolling "last N days" stats, which can reach earlier than the current calendar year in January. */
export function daysAgo(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

export type ChartPoint = { label: string; count: number };

/**
 * The window the admin statistics cover — the current calendar year, widened
 * back to a rolling 30 days in January (when the year holds almost nothing).
 *
 * Not private to the stats page: anything that has to line up with what those
 * charts display uses this, so the definition can't drift between the two.
 */
export function statsSince(now = new Date()): Date {
  const last30Days = daysAgo(30, now);
  const yearStart = startOfAppYear(now);
  return last30Days < yearStart ? last30Days : yearStart;
}

/**
 * Entries one recorded gate open stands for — people, not opens.
 *
 * A single open can admit several people: the account holder plus every
 * companion they take in. `openGateForUser` writes the resulting count into
 * the row's meta as it opens (the `entries` key), because the parts are only
 * known there — a paid entry can deduct several entries at once (staff's
 * "Kolik vstupů strhnout", one per person brought on this account's credits),
 * and the entry record keeps no reference to the ledger rows that carry that
 * breakdown.
 *
 * Rows recorded before that key existed fall back to the account holder plus
 * the companions recorded alongside them. The fallback is exact for every
 * self-service open (one entry each) and off only where a staff check-in
 * deducted several entries on one account (undercount) or the holder escorted
 * companions without entering themselves (overcount) — the entry row alone
 * simply doesn't say, so it isn't guessed at here.
 *
 * `meta` is the row's raw JSON blob: `GateEntry.meta` on the database
 * branches, `AuditLog.meta` on `app`. Both carry the same object.
 */
export function entriesPerOpen(meta: unknown): number {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return 1;
  const m = meta as Record<string, unknown>;
  // 0 is honoured rather than treated as missing: a record that says nobody
  // entered must not be counted as one person. No current path writes it.
  const recorded = Number(m.entries);
  if (Number.isFinite(recorded) && recorded >= 0) return Math.trunc(recorded);
  return 1 + (Array.isArray(m.dependents) ? m.dependents.length : 0);
}

/**
 * Whether a recorded entry belongs in the statistics at all.
 *
 * Members only. STAFF, ADMIN and ROOT pass the gate as part of running the
 * place — checking members in, trying the lock — so counting their opens
 * would show staff at work as visitor traffic. The role is the only thing
 * that tells them apart on an entry row: STAFF buys credits and climbs like
 * a member (`hasFreeGateEntry` gives free entry to admins only), and a
 * staff-verified check-in carries the *member's* `userId`, not the staff
 * member's, so those stay counted either way.
 *
 * A null role is an account that has since been deleted. The entry row
 * deliberately outlives it (`GateEntry.userId` is `onDelete: SetNull`, so
 * the historical counts survive account removal) and a deleted account
 * isn't on duty, so those stay counted too.
 */
export function countsInStats(role: string | null | undefined): boolean {
  return role == null || role === "MEMBER";
}

/**
 * One row per person the opens admitted, in the shape the bucket helpers
 * below take — the same trick `fetchEstimatedEntries` uses, so both series go
 * through the same counting code and mean the same thing by "an entry".
 */
export function expandOpensToEntries<T extends { createdAt: Date; meta: unknown }>(opens: T[]): { createdAt: Date }[] {
  const entries: { createdAt: Date }[] = [];
  for (const open of opens) {
    for (let i = 0, n = entriesPerOpen(open.meta); i < n; i++) entries.push({ createdAt: open.createdAt });
  }
  return entries;
}

export function bucketOpensByHourToday(opens: { createdAt: Date }[], now = new Date()): ChartPoint[] {
  const today = appWallParts(now).ymd;
  const counts = Array.from({ length: 24 }, () => 0);
  for (const row of opens) {
    const p = appWallParts(row.createdAt);
    if (p.ymd === today) counts[p.hour] += 1;
  }
  return counts.map((count, hour) => ({ label: `${String(hour).padStart(2, "0")}:00`, count }));
}

/** Same 24-hour buckets as `bucketOpensByHourToday`, but summed across the trailing 30 days instead of just today — shows which hours are busiest overall rather than one day's timeline. */
export function bucketOpensByHourLast30Days(opens: { createdAt: Date }[], now = new Date()): ChartPoint[] {
  const cutoff = daysAgo(30, now);
  const counts = Array.from({ length: 24 }, () => 0);
  for (const row of opens) {
    if (row.createdAt < cutoff) continue;
    const p = appWallParts(row.createdAt);
    counts[p.hour] += 1;
  }
  return counts.map((count, hour) => ({ label: `${String(hour).padStart(2, "0")}:00`, count }));
}

export function bucketOpensByDayThisMonth(opens: { createdAt: Date }[], now = new Date()): ChartPoint[] {
  const { year, month, ym } = appWallParts(now);
  const days = daysInAppMonth(now);
  const counts = new Map<string, number>();
  for (let d = 1; d <= days; d++) counts.set(`${ym}-${String(d).padStart(2, "0")}`, 0);
  for (const row of opens) {
    const p = appWallParts(row.createdAt);
    if (p.year === year && p.month === month) counts.set(p.ymd, (counts.get(p.ymd) || 0) + 1);
  }
  return [...counts.entries()].map(([ymd, count]) => ({ label: ymd.slice(8), count }));
}

export function bucketOpensByMonthThisYear(
  opens: { createdAt: Date }[],
  now = new Date(),
  locale = "cs-CZ",
): ChartPoint[] {
  const { year } = appWallParts(now);
  const formatter = new Intl.DateTimeFormat(locale, { month: "short", timeZone: APP_TZ });
  const monthNames = Array.from({ length: 12 }, (_, i) =>
    formatter.format(fromZonedTime(`${year}-${String(i + 1).padStart(2, "0")}-01T12:00:00`, APP_TZ)),
  );
  const counts = Array.from({ length: 12 }, () => 0);
  for (const row of opens) {
    const p = appWallParts(row.createdAt);
    if (p.year === year) counts[p.month - 1] += 1;
  }
  return counts.map((count, i) => ({ label: monthNames[i], count }));
}

export function topActiveUsers(
  opens: { userId: string | null; user: { email: string; name: string | null } | null }[],
  limit = 5,
): { userId: string; label: string; count: number }[] {
  const map = new Map<string, { label: string; count: number }>();
  for (const row of opens) {
    if (!row.userId || !row.user) continue;
    const label = row.user.name?.trim() ? `${row.user.name} (${row.user.email})` : row.user.email;
    const prev = map.get(row.userId);
    if (prev) prev.count += 1;
    else map.set(row.userId, { label, count: 1 });
  }
  return [...map.entries()]
    .map(([userId, v]) => ({ userId, ...v }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}
