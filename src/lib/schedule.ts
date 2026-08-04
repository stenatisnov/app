/**
 * Shared "runs at most once a day, at a fixed clock time" due-check —
 * used by both the SQL database dump backup and the audit-log cleanup job,
 * neither of which fit the simpler "every N minutes" polling the other
 * backups use. "Due" means today's `timeOfDay` has passed AND at least
 * `frequencyDays` whole days have elapsed since the last run (measured at
 * that same time-of-day, so a run that happens a few minutes late one day
 * doesn't shift the schedule).
 */
export function isDueOnDailySchedule(
  settings: { frequencyDays: number; timeOfDay: string; lastRunAt: string },
  now: Date,
): boolean {
  const [hh, mm] = settings.timeOfDay.split(":").map(Number);
  const scheduledToday = new Date(now);
  scheduledToday.setHours(hh || 0, mm || 0, 0, 0);
  if (now < scheduledToday) return false;
  if (!settings.lastRunAt) return true;

  const lastRunAtScheduledTime = new Date(settings.lastRunAt);
  lastRunAtScheduledTime.setHours(hh || 0, mm || 0, 0, 0);
  const daysSince = Math.round((scheduledToday.getTime() - lastRunAtScheduledTime.getTime()) / 86_400_000);
  return daysSince >= Math.max(1, settings.frequencyDays);
}
