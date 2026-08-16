import { data } from "react-router";
import type { Route } from "./+types/stats";
import { getPrisma } from "@/lib/db.server";
import { withLoadContext } from "@/lib/request-context.server";
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
import { useTranslations } from "@/i18n/i18n.client";
import { Link } from "@/i18n/navigation";

export async function loader({ context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const prisma = await getPrisma();
    const now = new Date();
    const last30Days = daysAgo(30, now);
    const since = last30Days < startOfAppYear(now) ? last30Days : startOfAppYear(now);

    const opens = await prisma.auditLog.findMany({
      where: { action: "gate.open", success: true, createdAt: { gte: since } },
      select: { createdAt: true, userId: true, user: { select: { email: true, name: true } } },
    });

    const topUsers = topActiveUsers(opens.filter((o) => o.createdAt >= last30Days));

    return data({
      nowIso: now.toISOString(),
      todayByHour: bucketOpensByHourToday(opens, now),
      hourLast30Days: bucketOpensByHourLast30Days(opens, now),
      thisMonthByDay: bucketOpensByDayThisMonth(opens, now),
      thisYearByMonth: bucketOpensByMonthThisYear(opens, now),
      topUsers,
    });
  });
}

export default function AdminStatsPage({ loaderData }: Route.ComponentProps) {
  const t = useTranslations("admin");
  const { todayByHour, hourLast30Days, thisMonthByDay, thisYearByMonth, topUsers } = loaderData;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("stats.title")}</h1>
        <Link href="/api/admin/stats.csv" className="btn btn-secondary !px-3 !py-1.5 text-xs">
          {t("stats.exportCsv")}
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        <StatsChart title={t("stats.todayByHour")} data={todayByHour} />
        <StatsChart title={t("stats.hourLast30Days")} data={hourLast30Days} />
        <StatsChart title={t("stats.thisMonthByDay")} data={thisMonthByDay} />
        <StatsChart title={t("stats.thisYearByMonth")} data={thisYearByMonth} />
      </div>

      <div className="card">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("stats.topUsers")}</h2>
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
