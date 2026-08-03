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

export type ChartPoint = { label: string; count: number };

export function bucketOpensByHourToday(opens: { createdAt: Date }[], now = new Date()): ChartPoint[] {
  const today = appWallParts(now).ymd;
  const counts = Array.from({ length: 24 }, () => 0);
  for (const row of opens) {
    const p = appWallParts(row.createdAt);
    if (p.ymd === today) counts[p.hour] += 1;
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
