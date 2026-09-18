import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { APP_TZ, WEEK_DAYS } from "./time";

/**
 * Europe/Prague wall-clock parts of an instant.
 *
 * Everything the statistics bucket by is a *calendar* field — a year, a month,
 * a day of the month, a weekday, an hour — and all of them are the ones on the
 * club's wall clock, not on the server's. `dayOfWeek` deliberately follows
 * `Date#getDay()` (0 = Sunday) rather than ISO numbering, so it can be used
 * straight against `WEEK_DAYS`; it is derived by UTC arithmetic on the
 * wall-clock date precisely so no timezone can shift it.
 */
export type AppWallParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  dayOfWeek: number;
  ymd: string;
  ym: string;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function appWallParts(date = new Date()): AppWallParts {
  const [y, m, d, h] = formatInTimeZone(date, APP_TZ, "yyyy|MM|dd|HH").split("|");
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  return {
    year,
    month,
    day,
    hour: Number(h),
    // Pure calendar arithmetic (UTC), not a timezone conversion: the inputs are
    // wall-clock fields already, and Date.UTC keeps the weekday stable whatever
    // the server's own zone or a DST transition does.
    dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    ymd: `${y}-${m}-${d}`,
    ym: `${y}-${m}`,
  };
}

export function daysInAppMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The instant at a given Europe/Prague wall-clock time — the entry point for
 * every boundary below, since `fromZonedTime` is what turns "midnight on the
 * 1st" into the UTC offset of the right season.
 *
 * `hour` is explicit for label formatting: month and weekday names are
 * generated from a midday instant so a DST transition at 00:00 can't render
 * the previous day's name.
 */
export function appWallClockInstant(year: number, month: number, day: number, hour: number): Date {
  return fromZonedTime(`${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:00:00`, APP_TZ);
}

/** Start of the given Prague calendar year, as a UTC instant — a half-open range's lower bound. */
export function startOfAppYear(year: number): Date {
  return appWallClockInstant(year, 1, 1, 0);
}

export function startOfAppMonth(year: number, month: number): Date {
  return appWallClockInstant(year, month, 1, 0);
}

export function startOfAppDay(year: number, month: number, day: number): Date {
  return appWallClockInstant(year, month, day, 0);
}

export function startOfNextAppMonth(year: number, month: number): Date {
  return month === 12 ? startOfAppMonth(year + 1, 1) : startOfAppMonth(year, month + 1);
}

export function startOfNextAppDay(year: number, month: number, day: number): Date {
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return startOfAppDay(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

export type ChartPoint = { label: string; count: number };

/** Month names of one year, in calendar order — the x axis of the year chart, and the month filter's labels. */
export function monthLabels(year: number, locale = "cs-CZ", style: "short" | "long" = "short"): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { month: style, timeZone: APP_TZ });
  return Array.from({ length: 12 }, (_, i) => formatter.format(appWallClockInstant(year, i + 1, 1, 12)));
}

/**
 * Short weekday names, Monday first — matching `WEEK_DAYS`, not `Date#getDay()`'s
 * Sunday-first order.
 *
 * The names are read off one reference week rather than written out as a
 * translation table: they are a property of the display language, which Intl
 * already knows.
 */
export function weekdayLabels(year: number, locale = "cs-CZ"): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: APP_TZ });
  // The Monday of the week that contains 1 January, then that week's days.
  const mondayUtc = Date.UTC(year, 0, 1 - ((new Date(Date.UTC(year, 0, 1)).getUTCDay() + 6) % 7));
  return WEEK_DAYS.map((dayOfWeek) => formatter.format(new Date(mondayUtc + ((dayOfWeek + 6) % 7) * 86_400_000)));
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
 * deliberately outlives it (`GateEntry.userId` is `onDelete: SetNull`, so the
 * historical counts survive account removal) and a deleted account isn't on
 * duty, so those stay counted too.
 */
export function countsInStats(role: string | null | undefined): boolean {
  return role == null || role === "MEMBER";
}

/**
 * Whether an entry row is a *free same-day re-entry* rather than a visit
 * somebody paid for.
 *
 * Once a member has entered on a given day, every further open that day is free
 * ("Dnes už jste platili, opětovný vstup je zdarma", `dailyUnlimitedEntries`),
 * and `openGateForUser` writes each of them as its own entry row. Those rows are
 * real gate passes but not visits — the member is already counted for that day —
 * and counting them again made a day with three paying visitors read as four.
 *
 * They are the only rows `openGateForUser` writes with nothing charged at all:
 * no credit, no period pass, no admin override and nobody brought along. That is
 * what this reads, rather than a flag of its own, because the rows that matter
 * are already in the database.
 *
 * A row that doesn't carry the flags is *not* treated as free — entries
 * reconstructed from bank payments, and rows recorded before `creditsUsed`
 * existed, say nothing about being free, so they stay counted.
 *
 * Should `openGateForUser` ever gain another reason to open for free, that
 * reason needs its own flag here, or this will quietly swallow it too.
 */
export function isFreeReentry(meta: unknown): boolean {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  const m = meta as Record<string, unknown>;
  if (typeof m.creditsUsed !== "boolean") return false;
  if (m.creditsUsed || m.usedPass === true || m.usedAdmin === true) return false;
  return (Array.isArray(m.dependents) ? m.dependents.length : 0) === 0;
}

/**
 * Whether one recorded entry belongs in the statistics at all: a member's entry
 * (`countsInStats`) that was paid for (`isFreeReentry`). The page and the CSV
 * export both filter through this one predicate, so they can't drift apart.
 */
export function countsEntry(row: { meta: unknown; user: { role: string } | null }): boolean {
  return countsInStats(row.user?.role) && !isFreeReentry(row.meta);
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

/**
 * What one entry row looks like to the statistics, whichever table it came
 * from — the branch-specific query (`src/lib/stats-source.ts`) normalizes its
 * rows into this, so nothing below has to care which branch it runs on.
 *
 * `simulated` is filled by that query for the same reason: `GateEntry` keeps
 * it in its own column, `app` only has it inside the audit row's meta.
 */
export type StatsRow = {
  createdAt: Date;
  userId: string | null;
  meta: unknown;
  simulated: boolean;
  user: { email: string; name: string | null; role: string } | null;
};

/**
 * The four breakdowns the statistics page can show, one call per series.
 *
 * Each takes rows already scoped to the period by the query and re-checks the
 * period anyway: both series (app entries and the bank-transfer estimate) are
 * bucketed by the same helper, so their labels are guaranteed to line up for
 * the stacked chart, and a stray row can only ever be dropped, never counted
 * into the wrong bucket.
 */
export function bucketByMonth(rows: { createdAt: Date }[], year: number, locale = "cs-CZ"): ChartPoint[] {
  const counts = Array.from({ length: 12 }, () => 0);
  for (const row of rows) {
    const p = appWallParts(row.createdAt);
    if (p.year === year) counts[p.month - 1] += 1;
  }
  const labels = monthLabels(year, locale);
  return counts.map((count, i) => ({ label: labels[i], count }));
}

export function bucketByWeekday(rows: { createdAt: Date }[], year: number, locale = "cs-CZ"): ChartPoint[] {
  const byDayOfWeek = new Map<number, number>();
  for (const row of rows) {
    const p = appWallParts(row.createdAt);
    if (p.year !== year) continue;
    byDayOfWeek.set(p.dayOfWeek, (byDayOfWeek.get(p.dayOfWeek) ?? 0) + 1);
  }
  return weekdayLabels(year, locale).map((label, i) => ({ label, count: byDayOfWeek.get(WEEK_DAYS[i]) ?? 0 }));
}

export function bucketByDayOfMonth(rows: { createdAt: Date }[], year: number, month: number): ChartPoint[] {
  const counts = Array.from({ length: daysInAppMonth(year, month) }, () => 0);
  for (const row of rows) {
    const p = appWallParts(row.createdAt);
    if (p.year === year && p.month === month) counts[p.day - 1] += 1;
  }
  return counts.map((count, i) => ({ label: pad2(i + 1), count }));
}

export function bucketByHour(rows: { createdAt: Date }[], year: number, month: number, day: number): ChartPoint[] {
  const counts = Array.from({ length: 24 }, () => 0);
  for (const row of rows) {
    const p = appWallParts(row.createdAt);
    if (p.year === year && p.month === month && p.day === day) counts[p.hour] += 1;
  }
  return counts.map((count, hour) => ({ label: `${pad2(hour)}:00`, count }));
}

/** Visits by one account over the period, most frequent first — the "most active" card. */
export function topActiveUsers(rows: StatsRow[], limit = 5): { userId: string; label: string; count: number }[] {
  const map = new Map<string, { label: string; count: number }>();
  for (const row of rows) {
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
