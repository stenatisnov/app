import { data } from "react-router";
import type { Route } from "./+types/stats";
import { getPrisma } from "@/lib/db";
import { backfillEstimatedEntries, fetchEstimatedEntries } from "@/lib/payment-entry-estimate";
import { withLoadContext } from "@/lib/request-context.server";
import {
  bucketOpensByDayThisMonth,
  bucketOpensByHourLast30Days,
  bucketOpensByHourToday,
  bucketOpensByMonthThisYear,
  daysAgo,
  statsSince,
  topActiveUsers,
} from "@/lib/stats";
import { StatsChart } from "@/components/StatsChart";
import { useTranslations } from "@/i18n/translations";
import { Link } from "@/i18n/navigation";

export async function loader({ context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const prisma = await getPrisma();
    const now = new Date();
    const last30Days = daysAgo(30, now);
    const since = statsSince(now);

    const opens = await prisma.auditLog.findMany({
      where: { action: "gate.open", success: true, createdAt: { gte: since } },
      select: { createdAt: true, userId: true, user: { select: { email: true, name: true } } },
    });

    // Estimated entries from bank transfers that never went through the app
    // (see `src/lib/payment-entry-estimate.ts`) — deliberately a separate
    // series, never added into `opens`: it is a guess from the price list,
    // not a measurement.
    //
    // Estimates are recorded when a transfer is polled; this only seeds the
    // ones from before that table existed out of the audit rows still on hand
    // (idempotent, hence safe on every view).
    await backfillEstimatedEntries(prisma, since);
    const estimated = await fetchEstimatedEntries(prisma, since);

    const topUsers = topActiveUsers(opens.filter((o) => o.createdAt >= last30Days));

    return data({
      nowIso: now.toISOString(),
      todayByHour: bucketOpensByHourToday(opens, now),
      hourLast30Days: bucketOpensByHourLast30Days(opens, now),
      thisMonthByDay: bucketOpensByDayThisMonth(opens, now),
      thisYearByMonth: bucketOpensByMonthThisYear(opens, now),
      todayByHourEstimated: bucketOpensByHourToday(estimated, now),
      hourLast30DaysEstimated: bucketOpensByHourLast30Days(estimated, now),
      thisMonthByDayEstimated: bucketOpensByDayThisMonth(estimated, now),
      thisYearByMonthEstimated: bucketOpensByMonthThisYear(estimated, now),
      topUsers,
    });
  });
}

export default function AdminStatsPage({ loaderData }: Route.ComponentProps) {
  const t = useTranslations("admin");
  const {
    todayByHour,
    hourLast30Days,
    thisMonthByDay,
    thisYearByMonth,
    todayByHourEstimated,
    hourLast30DaysEstimated,
    thisMonthByDayEstimated,
    thisYearByMonthEstimated,
    topUsers,
  } = loaderData;
  const seriesLabels = { primaryLabel: t("stats.appEntries"), secondaryLabel: t("stats.estimatedEntries") };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("stats.title")}</h1>
        <Link href="/api/admin/stats.csv" className="btn btn-secondary !px-3 !py-1.5 text-xs">
          {t("stats.exportCsv")}
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-xs text-[var(--muted)]">{t("stats.estimatedHint")}</p>
        <StatsChart title={t("stats.todayByHour")} data={todayByHour} secondary={todayByHourEstimated} {...seriesLabels} />
        <StatsChart
          title={t("stats.hourLast30Days")}
          data={hourLast30Days}
          secondary={hourLast30DaysEstimated}
          {...seriesLabels}
        />
        <StatsChart
          title={t("stats.thisMonthByDay")}
          data={thisMonthByDay}
          secondary={thisMonthByDayEstimated}
          {...seriesLabels}
        />
        <StatsChart
          title={t("stats.thisYearByMonth")}
          data={thisYearByMonth}
          secondary={thisYearByMonthEstimated}
          {...seriesLabels}
        />
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
