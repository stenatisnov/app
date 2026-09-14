import type { ChangeEvent } from "react";
import { data, useNavigate } from "react-router";
import type { Route } from "./+types/stats";
import { getPrisma } from "@/lib/db.server";
import { backfillEstimatedEntries, fetchEstimatedEntries } from "@/lib/payment-entry-estimate";
import { withLoadContext } from "@/lib/request-context.server";
import { fetchOpensInRange, firstDataYear } from "@/lib/stats-source";
import {
  bucketByDayOfMonth,
  bucketByHour,
  bucketByMonth,
  bucketByWeekday,
  countsInStats,
  daysInAppMonth,
  expandOpensToEntries,
  monthLabels,
  topActiveUsers,
  type ChartPoint,
} from "@/lib/stats";
import { nextStatsFilterParams, parseStatsFilter, statsFilterQuery, todayInAppTz } from "@/lib/stats-filter";
import { StatsChart } from "@/components/StatsChart";
import { useTranslations } from "@/i18n/translations";

/** Both series of one chart, bucketed with the same helper so their labels line up. */
type Series = { primary: ChartPoint[]; secondary: ChartPoint[] };

const inputClass = "input !py-1 text-sm";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const prisma = await getPrisma();
    const now = new Date();
    const filter = parseStatsFilter(new URL(request.url).searchParams, now);
    const dateLocale = params.locale === "en" ? "en-GB" : "cs-CZ";

    // Entry rows for exactly the period the filter picked — a day's worth for a
    // day, a month's for a month. The query itself is the one branch-specific
    // piece of the statistics; see `src/lib/stats-source.ts`, which on this
    // branch reads `GateEntry` rather than the `gate.open` audit rows, so the
    // log cleanup can't erase the history out from under these charts.
    const [rows, firstYear] = await Promise.all([fetchOpensInRange(prisma, filter), firstDataYear(prisma, now)]);

    // Member entries only — see `countsInStats`: the statistics are about what
    // visitors climb, not about staff at work. Applies to everything below, the
    // "most active" list included.
    const opens = rows.filter((row) => countsInStats(row.user?.role));

    // People, not opens: one open can admit a member with their companions, and
    // the statistics' unit is the entry (see `entriesPerOpen`), the same one the
    // bank-transfer estimate below counts in.
    const entries = expandOpensToEntries(opens);

    // Estimated entries from bank transfers that never went through the app
    // (see `src/lib/payment-entry-estimate.ts`) — deliberately a separate
    // series, never added into `opens`: it is a guess from the price list, not a
    // measurement. Estimates are recorded when a transfer is polled; this only
    // seeds the ones from before that table existed out of the audit rows still
    // on hand (idempotent, hence safe on every view), scoped to the same period.
    await backfillEstimatedEntries(prisma, filter);
    const estimated = await fetchEstimatedEntries(prisma, filter);

    // Only the level the filter actually reached is charted: a year shows the
    // whole year by month and by weekday, a month shows its days, a day its
    // hours. Each is a separate chart because each answers a different question,
    // not because one of them is re-sliced.
    const { year, month, day, level } = filter;
    const charts: {
      yearByMonth: Series | null;
      yearByWeekday: Series | null;
      monthByDay: Series | null;
      dayByHour: Series | null;
    } = { yearByMonth: null, yearByWeekday: null, monthByDay: null, dayByHour: null };

    if (level === "year") {
      const byMonth = (rows: { createdAt: Date }[]) => bucketByMonth(rows, year, dateLocale);
      const byWeekday = (rows: { createdAt: Date }[]) => bucketByWeekday(rows, year, dateLocale);
      charts.yearByMonth = { primary: byMonth(entries), secondary: byMonth(estimated) };
      charts.yearByWeekday = { primary: byWeekday(entries), secondary: byWeekday(estimated) };
    } else if (level === "month" && month !== null) {
      const byDay = (rows: { createdAt: Date }[]) => bucketByDayOfMonth(rows, year, month);
      charts.monthByDay = { primary: byDay(entries), secondary: byDay(estimated) };
    } else if (level === "day" && month !== null && day !== null) {
      const byHour = (rows: { createdAt: Date }[]) => bucketByHour(rows, year, month, day);
      charts.dayByHour = { primary: byHour(entries), secondary: byHour(estimated) };
    }

    // The year filter offers every year there is anything to show for — entries
    // or the estimate, whichever reaches further back. The filter's own year is
    // folded in so a hand-edited link still shows what it selected.
    const today = todayInAppTz(now);
    const years: number[] = [];
    for (let y = Math.max(today.year, year); y >= Math.min(firstYear, year); y--) years.push(y);

    return data({
      filter: { year, month, day, level, params: filter.params },
      today,
      years,
      monthNames: monthLabels(year, dateLocale, "long"),
      // With every month selected a day means that day of the current month
      // (see `parseStatsFilter`), so the select offers that month's days — which
      // is why this is 28–31 rather than always 31.
      daysInMonth: daysInAppMonth(year, month ?? today.month),
      // "Celkem" is the two series added up — the page's only number that mixes
      // a measurement with a guess, which is why the two are always shown beside
      // it rather than hidden behind it.
      totals: { total: entries.length + estimated.length, app: entries.length, estimated: estimated.length },
      charts,
      topUsers: topActiveUsers(opens),
    });
  });
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="text-3xl font-bold text-[var(--ink)]">{value}</p>
    </div>
  );
}

export default function AdminStatsPage({ loaderData }: Route.ComponentProps) {
  const t = useTranslations("admin");
  const navigate = useNavigate();
  const { filter, today, years, monthNames, daysInMonth, totals, charts, topUsers } = loaderData;
  const seriesLabels = { primaryLabel: t("stats.appEntries"), secondaryLabel: t("stats.estimatedEntries") };

  const monthName = filter.month === null ? "" : monthNames[filter.month - 1];
  const periodLabel =
    filter.level === "day"
      ? t("stats.periodDay", { day: filter.day, month: monthName, year: filter.year })
      : filter.level === "month"
        ? t("stats.periodMonth", { month: monthName, year: filter.year })
        : t("stats.periodYear", { year: filter.year });

  /**
   * Filtering is a navigation, not a form submit: the URL is the only state the
   * page has, so a filtered view is a link that can be shared and reloaded.
   * `nextStatsFilterParams` resolves the "Aktuální …" sentinels on the way out
   * (see its note) — the form below stays a real GET form for the
   * no-JavaScript case, where the submit button stands in for this handler.
   */
  function onFilterChange(event: ChangeEvent<HTMLSelectElement>) {
    const { name, value } = event.currentTarget;
    const next = nextStatsFilterParams(filter.params, name as "year" | "month" | "day", value, today);
    void navigate(`?${statsFilterQuery(next)}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("stats.title")}</h1>
        {/* A plain anchor, not the i18n `Link`: resource routes carry no locale
            prefix (see `app/routes.ts`), and `Link` would prepend one. */}
        <a href={`/api/admin/stats.csv?${statsFilterQuery(filter.params)}`} className="btn btn-secondary !px-3 !py-1.5 text-xs">
          {t("stats.exportCsv")}
        </a>
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("stats.filterYear")}
          <select name="year" value={filter.params.year} onChange={onFilterChange} className={inputClass}>
            <option value="current">{t("stats.yearCurrent")}</option>
            {years.map((year) => (
              <option key={year} value={String(year)}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("stats.filterMonth")}
          <select name="month" value={filter.params.month} onChange={onFilterChange} className={inputClass}>
            <option value="all">{t("stats.monthAll")}</option>
            <option value="current">{t("stats.monthCurrent")}</option>
            {monthNames.map((name, i) => (
              <option key={name} value={String(i + 1)}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("stats.filterDay")}
          {/* Always selectable: with every month selected a day means that day of
              the current month, which the handler below fills the month in with. */}
          <select name="day" value={filter.params.day} onChange={onFilterChange} className={inputClass}>
            <option value="">{t("stats.dayUnset")}</option>
            <option value="current">{t("stats.dayCurrent")}</option>
            {Array.from({ length: daysInMonth }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-secondary !px-3 !py-1.5 text-xs">
          {t("stats.filterSubmit")}
        </button>
      </form>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-[var(--ink)]">{periodLabel}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label={t("stats.totalEntries")} value={totals.total} />
          <StatTile label={t("stats.appEntries")} value={totals.app} />
          <StatTile label={t("stats.estimatedEntries")} value={totals.estimated} />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-xs text-[var(--muted)]">{t("stats.estimatedHint")}</p>
        {charts.yearByMonth && (
          <StatsChart
            title={t("stats.chartYearByMonth", { year: filter.year })}
            data={charts.yearByMonth.primary}
            secondary={charts.yearByMonth.secondary}
            {...seriesLabels}
          />
        )}
        {charts.yearByWeekday && (
          <StatsChart
            title={t("stats.chartYearByWeekday", { year: filter.year })}
            data={charts.yearByWeekday.primary}
            secondary={charts.yearByWeekday.secondary}
            {...seriesLabels}
          />
        )}
        {charts.monthByDay && (
          <StatsChart
            title={t("stats.chartMonthByDay", { month: monthName, year: filter.year })}
            data={charts.monthByDay.primary}
            secondary={charts.monthByDay.secondary}
            {...seriesLabels}
          />
        )}
        {charts.dayByHour && (
          <StatsChart
            title={t("stats.chartDayByHour", { day: filter.day, month: monthName, year: filter.year })}
            data={charts.dayByHour.primary}
            secondary={charts.dayByHour.secondary}
            {...seriesLabels}
          />
        )}
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
