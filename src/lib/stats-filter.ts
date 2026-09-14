import {
  appWallParts,
  daysInAppMonth,
  startOfAppDay,
  startOfAppMonth,
  startOfAppYear,
  startOfNextAppDay,
  startOfNextAppMonth,
} from "./stats";

/**
 * The year/month/day filter the statistics page is built around, and the two
 * ways it gets edited: the URL (`parseStatsFilter`) and the filter form's
 * selects (`nextStatsFilterParams`).
 *
 * The three levels nest. A year alone is the finest-grained thing the page can
 * show a summary for; a month narrows it to one of that year's months, a day
 * to one day of that month. "Every month" is the year level — which is why the
 * day then has nothing to attach to and the form disables it.
 */

export type StatsLevel = "year" | "month" | "day";

/**
 * The filter as its URL carries it. `current` is the sentinel behind the
 * "Aktuální rok / Aktuální měsíc / Dnes" options: it means *the real current
 * one*, resolved against the clock when the filter is parsed.
 *
 * Deliberately not the same shape as `StatsFilter`: this is what the form's
 * selects exchange with the URL, and keeping the sentinel intact (rather than
 * freezing today's date into the link) is what lets a bookmarked page follow
 * the current day. `parseStatsFilter` turns it into resolved numbers.
 */
export type StatsFilterParams = { year: string; month: string; day: string };

/** Today's Prague wall-clock date — what every `current` sentinel resolves to. */
export type StatsToday = { year: number; month: number; day: number };

export type StatsFilter = {
  year: number;
  /** `null` = every month of `year`. */
  month: number | null;
  /** `null` = the whole month (or year) rather than a single day. */
  day: number | null;
  /** The deepest level the filter has a value for — which breakdown the page shows. */
  level: StatsLevel;
  /** Inclusive lower bound of the selected period, as a UTC instant. */
  from: Date;
  /** Exclusive upper bound, so a day/month/year is a half-open range with no `23:59:59` fudge. */
  to: Date;
  /** The URL values the filter form should render, sentinels and all. */
  params: StatsFilterParams;
};

export function todayInAppTz(now = new Date()): StatsToday {
  const { year, month, day } = appWallParts(now);
  return { year, month, day };
}

/**
 * Reads the filter out of the URL.
 *
 * Anything unrecognized falls back to the default the page opens with —
 * current year, every month, no day — rather than erroring, so a hand-edited
 * or stale link still renders a sensible page. A day that doesn't exist in the
 * chosen month (29 February in a common year, 31 April) is clamped to that
 * month's last day.
 */
export function parseStatsFilter(searchParams: URLSearchParams, now = new Date()): StatsFilter {
  const today = todayInAppTz(now);
  const rawYear = (searchParams.get("year") ?? "").trim();
  const rawMonth = (searchParams.get("month") ?? "").trim();
  const rawDay = (searchParams.get("day") ?? "").trim();

  // An absent `year` is "Aktuální rok" — the page's default.
  const yearIsCurrent = rawYear === "" || rawYear === "current";
  const parsedYear = Number(rawYear);
  let year =
    yearIsCurrent || !Number.isInteger(parsedYear) || parsedYear < 1000 || parsedYear > 9999 ? today.year : parsedYear;

  // An absent or `all` month is every month of `year`; `current` is this month
  // of *this* year, so it drags the year along with it.
  const monthIsCurrent = rawMonth === "current";
  let month: number | null = null;
  if (monthIsCurrent) {
    month = today.month;
    year = today.year;
  } else if (rawMonth !== "" && rawMonth !== "all") {
    const parsedMonth = Number(rawMonth);
    if (Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12) month = parsedMonth;
  }

  // A day always lands in one month. With every month selected there is no
  // month for it to fall in, so it means that day of the *current* month —
  // the month is filled in from the day rather than the day being dropped.
  // "Dnes" is the exception: it means the real today, so it drags the year
  // along with it like every other "Aktuální …" choice.
  const dayIsCurrent = rawDay === "current";
  let day: number | null = null;
  if (dayIsCurrent) {
    day = today.day;
    month = today.month;
    year = today.year;
  } else if (rawDay !== "") {
    const parsedDay = Number(rawDay);
    if (Number.isInteger(parsedDay) && parsedDay >= 1) {
      if (month === null) month = today.month;
      day = Math.min(parsedDay, daysInAppMonth(year, month));
    }
  }

  // Narrowing here rather than with assertions: which level the filter is at is
  // exactly what decides which fields are non-null.
  let level: StatsLevel;
  let from: Date;
  let to: Date;
  if (day !== null && month !== null) {
    level = "day";
    from = startOfAppDay(year, month, day);
    to = startOfNextAppDay(year, month, day);
  } else if (month !== null) {
    level = "month";
    from = startOfAppMonth(year, month);
    to = startOfNextAppMonth(year, month);
  } else {
    level = "year";
    from = startOfAppYear(year);
    to = startOfAppYear(year + 1);
  }

  return {
    year,
    month,
    day,
    level,
    from,
    to,
    // Echoed back as the form should show them: a sentinel stays a sentinel, so
    // "Aktuální rok" stays selected while the page follows the clock.
    params: {
      year: yearIsCurrent || monthIsCurrent || dayIsCurrent ? "current" : String(year),
      month: month === null ? "all" : monthIsCurrent || dayIsCurrent ? "current" : String(month),
      day: day === null ? "" : dayIsCurrent ? "current" : String(day),
    },
  };
}

/** The filter as a query string — the CSV link, and the target of the form's client-side navigation. */
export function statsFilterQuery(params: StatsFilterParams): string {
  const search = new URLSearchParams();
  search.set("year", params.year);
  search.set("month", params.month);
  search.set("day", params.day);
  return search.toString();
}

/**
 * The params to navigate to after one select changes — the client-side half of
 * the filter.
 *
 * Two rules make the result predictable. First, every sentinel is materialized
 * on the way out, so the URL that results is always concrete: `current` is
 * replaced by the date it stood for. That is what stops a stale "Aktuální
 * měsíc" left in a select from dragging the whole filter back to today when
 * some *other* select is edited — the edited field's neighbours keep the values
 * they were showing.
 *
 * Second, picking "current" in a select is a jump to the real current period,
 * so it takes its parents with it (`Dnes` means today, not "the 14th of
 * whatever month is on screen"), and re-picking the year or month drops the
 * day rather than leaving behind a day of the month that is no longer selected.
 *
 * A day picked while every month is selected fills the month in — see
 * `parseStatsFilter` — so the day is reachable in one step from the default
 * view and still ends up as one concrete day.
 */
export function nextStatsFilterParams(
  current: StatsFilterParams,
  changed: keyof StatsFilterParams,
  value: string,
  today: StatsToday,
): StatsFilterParams {
  const next: StatsFilterParams = {
    year: current.year === "current" ? String(today.year) : current.year,
    month: current.month === "current" ? String(today.month) : current.month,
    day: current.day === "current" ? String(today.day) : current.day,
  };

  const picked =
    value === "current"
      ? changed === "year"
        ? String(today.year)
        : changed === "month"
          ? String(today.month)
          : String(today.day)
      : value;

  if (changed === "year") next.year = picked;
  else if (changed === "month") next.month = picked;
  else next.day = picked;

  // "Aktuální měsíc"/"Dnes" are the real current ones, so they carry their parents.
  if (changed === "month" && value === "current") next.year = String(today.year);
  if (changed === "day" && value === "current") {
    next.month = String(today.month);
    next.year = String(today.year);
  }

  // The day belongs to the month that was selected when it was picked.
  if (changed === "year" || changed === "month") next.day = "";
  // ...and a picked day implies a month: with every month selected it means that
  // day of the current one, exactly as `parseStatsFilter` reads it back.
  // Clearing the day is not a pick, so it leaves the month alone and the filter
  // falls back to the whole year.
  if (changed === "day" && value !== "" && next.month === "all") next.month = String(today.month);
  if (next.month === "all") next.day = "";

  return next;
}
