import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import {
  bucketOpensByDayThisMonth,
  bucketOpensByHourLast30Days,
  bucketOpensByHourToday,
  bucketOpensByMonthThisYear,
  daysAgo,
  startOfAppYear,
  topActiveUsers,
} from "@/lib/stats";
import { StatsChart } from "@/components/StatsChart";
import { Link } from "@/i18n/navigation";

export default async function AdminStatsPage() {
  const t = await getTranslations("admin.stats");

  const now = new Date();
  const last30Days = daysAgo(30, now);
  // The rolling 30-day stats can reach back before Jan 1st in early January —
  // fetch from whichever bound is earlier so both that and "this year by
  // month" have all the rows they need from a single query.
  const since = last30Days < startOfAppYear(now) ? last30Days : startOfAppYear(now);

  const opens = await prisma.auditLog.findMany({
    where: { action: "gate.open", success: true, createdAt: { gte: since } },
    select: { createdAt: true, userId: true, user: { select: { email: true, name: true } } },
  });

  const topUsers = topActiveUsers(opens.filter((o) => o.createdAt >= last30Days));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>
        <Link href="/api/admin/stats.csv" className="btn btn-secondary !px-3 !py-1.5 text-xs">
          {t("exportCsv")}
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        <StatsChart title={t("todayByHour")} data={bucketOpensByHourToday(opens, now)} />
        <StatsChart title={t("hourLast30Days")} data={bucketOpensByHourLast30Days(opens, now)} />
        <StatsChart title={t("thisMonthByDay")} data={bucketOpensByDayThisMonth(opens, now)} />
        <StatsChart title={t("thisYearByMonth")} data={bucketOpensByMonthThisYear(opens, now)} />
      </div>

      <div className="card">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("topUsers")}</h2>
        <ul className="mt-2 divide-y divide-[var(--line)] text-sm text-[var(--ink)]">
          {topUsers.map((u) => (
            <li key={u.userId} className="flex justify-between py-1.5">
              <span>{u.label}</span>
              <span className="font-medium">{u.count}</span>
            </li>
          ))}
          {topUsers.length === 0 && <li className="py-1.5 text-[var(--muted)]">—</li>}
        </ul>
      </div>
    </div>
  );
}
