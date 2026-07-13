import { TZDate } from "@date-fns/tz";
import { endOfWeek, format } from "date-fns";

/**
 * All timezone logic lives in this module (spec §10.3): UTC in the database,
 * user timezone at the edges. Callers pass the user's IANA timezone in.
 */

/** Calendar day ("YYYY-MM-DD") an instant falls on in the user's timezone. */
export function userDayKey(instant: Date, tz: string): string {
  return format(new TZDate(instant, tz), "yyyy-MM-dd");
}

/**
 * Convert a wall-clock date (+ optional "HH:mm" time) in the user's timezone
 * to the UTC instant it denotes. A null time means midnight — the convention
 * for all-day dues.
 */
export function fromWallTime(
  dateStr: string,
  timeStr: string | null,
  tz: string,
): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = (timeStr ?? "00:00").split(":").map(Number);
  const zoned = new TZDate(y, m - 1, d, hh, mm, 0, 0, tz);
  return new Date(zoned.getTime());
}

export type DueGroup = "overdue" | "today" | "thisWeek" | "later" | "none";

/**
 * Todo-list grouping (spec 6.2). Day-granular in the user's timezone:
 * a task due earlier today is "today", not "overdue". Weeks start Monday;
 * "thisWeek" runs through Sunday.
 */
export function dueGroup(dueAt: Date | null, now: Date, tz: string): DueGroup {
  if (!dueAt) return "none";
  const day = userDayKey(dueAt, tz);
  const today = userDayKey(now, tz);
  if (day < today) return "overdue";
  if (day === today) return "today";
  const weekEnd = userDayKey(
    endOfWeek(new TZDate(now, tz), { weekStartsOn: 1 }),
    tz,
  );
  return day <= weekEnd ? "thisWeek" : "later";
}
