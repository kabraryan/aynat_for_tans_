import * as chrono from "chrono-node";
import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { fromWallTime } from "@/lib/dates";

/**
 * Natural-language quick-add (spec 6.6): "finish ps4 friday 5pm #cs201 !high".
 * Pure and LLM-free — chrono-node handles the date words; #tags map to
 * courses; !high/!low set priority. Everything parsed is stripped from the
 * title.
 *
 * Timezone note: chrono thinks in the *machine's* local timezone. We hand it
 * a reference Date whose machine-local wall clock equals the user's wall
 * clock in their tz, then re-anchor the parsed wall components with
 * fromWallTime — so "friday 5pm" is Friday 5pm IST no matter where the
 * machine runs.
 */

export type QuickAddCourse = { id: string; name: string; code: string | null };

export type ParsedQuickAdd = {
  title: string;
  dueAt: string | null; // ISO UTC
  allDayDue: boolean;
  priority: "LOW" | "MEDIUM" | "HIGH";
  courseId: string | null;
};

export function parseQuickAdd(
  input: string,
  opts: { now: Date; tz: string; courses: QuickAddCourse[] },
): ParsedQuickAdd {
  let text = input.trim();
  let priority: ParsedQuickAdd["priority"] = "MEDIUM";
  let courseId: string | null = null;

  // !priority
  text = text.replace(/(^|\s)!(high|medium|low)\b/i, (_m, pre, level: string) => {
    priority = level.toUpperCase() as ParsedQuickAdd["priority"];
    return pre;
  });

  // #course — matches code or squashed name; unknown tags are left alone
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  text = text.replace(/(^|\s)#([a-z0-9-]+)\b/i, (match, pre, tag: string) => {
    const key = squash(tag);
    const course = opts.courses.find(
      (c) => (c.code && squash(c.code) === key) || squash(c.name) === key,
    );
    if (!course) return match; // keep unknown tag in the title
    courseId = course.id;
    return pre;
  });

  // date/time via chrono against a tz-shifted reference
  const zonedNow = new TZDate(opts.now, opts.tz);
  const ref = new Date(
    zonedNow.getFullYear(),
    zonedNow.getMonth(),
    zonedNow.getDate(),
    zonedNow.getHours(),
    zonedNow.getMinutes(),
    zonedNow.getSeconds(),
  );
  const results = chrono.parse(text, ref, { forwardDate: true });
  let dueAt: string | null = null;
  let allDayDue = false;

  if (results.length > 0) {
    const r = results[0];
    const dateStr = `${r.start.get("year")}-${pad(r.start.get("month"))}-${pad(r.start.get("day"))}`;
    const timed = r.start.isCertain("hour");
    const timeStr = timed
      ? `${pad(r.start.get("hour"))}:${pad(r.start.get("minute") ?? 0)}`
      : null;
    dueAt = fromWallTime(dateStr, timeStr, opts.tz).toISOString();
    allDayDue = !timed;

    // remove the matched date text, then any dangling connector before it
    text = (text.slice(0, r.index) + text.slice(r.index + r.text.length)).trim();
    text = text.replace(/\b(due|on|at|by|for)\s*$/i, "").trim();
  }

  return {
    title: text.replace(/\s{2,}/g, " ").trim(),
    dueAt,
    allDayDue,
    priority,
    courseId,
  };
}

function pad(n: number | null): string {
  return String(n ?? 0).padStart(2, "0");
}

/** Human preview of what will be created — shown as chips under the input. */
export function describeParsed(parsed: ParsedQuickAdd, tz: string): string[] {
  const chips: string[] = [];
  if (parsed.dueAt) {
    const zoned = new TZDate(new Date(parsed.dueAt), tz);
    chips.push(
      parsed.allDayDue
        ? format(zoned, "EEE, MMM d")
        : format(zoned, "EEE, MMM d · HH:mm"),
    );
  }
  if (parsed.priority !== "MEDIUM") chips.push(parsed.priority.toLowerCase());
  return chips;
}
