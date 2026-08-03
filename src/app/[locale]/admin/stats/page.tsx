import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import {
  bucketOpensByDayThisMonth,
  bucketOpensByHourToday,
  bucketOpensByMonthThisYear,
  startOfAppYear,
  topActiveUsers,
} from "@/lib/stats";
import { StatsChart } from "@/components/StatsChart";
import { Link } from "@/i18n/navigation";

export default async function AdminStatsPage() {
  const t = await getTranslations("admin.stats");

  const opens = await prisma.auditLog.findMany({
    where: { action: "gate.open", success: true, createdAt: { gte: startOfAppYear() } },
    select: { createdAt: true, userId: true, user: { select: { email: true, name: true } } },
  });

  const topUsers = topActiveUsers(opens);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>
        <Link href="/api/admin/stats.csv" className="btn btn-secondary !px-3 !py-1.5 text-xs">
          {t("exportCsv")}
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatsChart title={t("todayByHour")} data={bucketOpensByHourToday(opens)} />
        <StatsChart title={t("thisMonthByDay")} data={bucketOpensByDayThisMonth(opens)} />
        <StatsChart title={t("thisYearByMonth")} data={bucketOpensByMonthThisYear(opens)} />
      </div>

      <div>
        <h2 className="text-lg font-medium">{t("topUsers")}</h2>
        <ul className="mt-2 divide-y divide-[var(--line)] text-sm">
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
