import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

/** The app has a single physical location; all wall-clock logic is fixed to it. */
export const APP_TZ = "Europe/Prague";

/** Monday-first display order; `dayOfWeek` values still follow `Date#getDay()` (0 = Sunday). */
export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

export type WindowLike = {
  dayOfWeek: number;
  fromMin: number;
  toMin: number;
};

/**
 * Parses a `<input type="datetime-local">` value as Europe/Prague wall-clock
 * time and returns the corresponding UTC instant.
 *
 * Plain `new Date(isoString)` would interpret a bare "YYYY-MM-DDTHH:mm"
 * string as UTC, which silently shifts admin-entered times by the current
 * CET/CEST offset — this is why the manual parse below exists.
 */
export function parseAppLocalDateTime(value: string): Date {
  const raw = value.trim();
  if (!raw) return new Date(NaN);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw);
  if (!match) return new Date(raw);
  const [, y, mo, d, h, mi, s] = match;
  const wallClock = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    s ? Number(s) : 0,
  );
  return fromZonedTime(wallClock, APP_TZ);
}

/** Formats an instant back into a `datetime-local` input value, Europe/Prague. */
export function toAppDateTimeLocalValue(date = new Date()): string {
  return formatInTimeZone(date, APP_TZ, "yyyy-MM-dd'T'HH:mm");
}

/** Formats an instant back into a `date` input value, Europe/Prague. */
export function toAppDateValue(date = new Date()): string {
  return formatInTimeZone(date, APP_TZ, "yyyy-MM-dd");
}

/**
 * Parses a `<input type="date">` value as the start (00:00:00) of that
 * Europe/Prague calendar day and returns the corresponding UTC instant.
 */
export function parseAppLocalDate(value: string): Date {
  const raw = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return new Date(NaN);
  const [, y, mo, d] = match;
  const wallClock = new Date(Number(y), Number(mo) - 1, Number(d), 0, 0, 0, 0);
  return fromZonedTime(wallClock, APP_TZ);
}

/**
 * Parses a `<input type="date">` value as the end (23:59:59.999) of that
 * Europe/Prague calendar day — pairs with `parseAppLocalDate` so validity
 * ranges always cover whole days.
 */
export function parseAppLocalDateEndOfDay(value: string): Date {
  const raw = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return new Date(NaN);
  const [, y, mo, d] = match;
  const wallClock = new Date(Number(y), Number(mo) - 1, Number(d), 23, 59, 59, 999);
  return fromZonedTime(wallClock, APP_TZ);
}

/** Human-readable Europe/Prague date+time for admin lists and emails. */
export function formatAppDateTime(date: Date, locale = "cs-CZ"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: APP_TZ,
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

/** Human-readable Europe/Prague date (no time) — used for whole-day validity ranges. */
export function formatAppDate(date: Date, locale = "cs-CZ"): string {
  return new Intl.DateTimeFormat(locale, { timeZone: APP_TZ, dateStyle: "short" }).format(date);
}

export function nowInAppTz(date = new Date()): Date {
  return toZonedTime(date, APP_TZ);
}

export function currentDayAndMinutes(date = new Date()): {
  dayOfWeek: number;
  minutes: number;
} {
  const local = nowInAppTz(date);
  return {
    dayOfWeek: local.getDay(),
    minutes: local.getHours() * 60 + local.getMinutes(),
  };
}

/** True if `date` (default: now) falls inside any of the given weekly windows. */
export function isWithinWindows(
  windows: WindowLike[],
  is24_7: boolean,
  date = new Date(),
): boolean {
  if (is24_7) return true;
  if (windows.length === 0) return false;
  const { dayOfWeek, minutes } = currentDayAndMinutes(date);
  return windows.some(
    (w) => w.dayOfWeek === dayOfWeek && minutes >= w.fromMin && minutes < w.toMin,
  );
}

export function minutesToTimeLabel(min: number): string {
  const h = Math.floor(min / 60).toString().padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function timeLabelToMinutes(label: string): number {
  const [h, m] = label.split(":").map(Number);
  return h * 60 + m;
}
