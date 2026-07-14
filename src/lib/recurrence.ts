import { addDays, addMonths } from "date-fns";
import { TZDate } from "@date-fns/tz";

export type RepeatFreq = "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";

/**
 * Next occurrence of a repeating task's due instant, computed on the user's
 * wall clock (so a 5pm due stays 5pm across DST, and monthly clamps to the
 * shorter month's end).
 */
export function nextOccurrence(dueAt: Date, repeat: RepeatFreq, tz: string): Date {
  const zoned = new TZDate(dueAt, tz);
  const next =
    repeat === "DAILY"
      ? addDays(zoned, 1)
      : repeat === "WEEKLY"
        ? addDays(zoned, 7)
        : repeat === "BIWEEKLY"
          ? addDays(zoned, 14)
          : addMonths(zoned, 1);
  return new Date(next.getTime());
}
