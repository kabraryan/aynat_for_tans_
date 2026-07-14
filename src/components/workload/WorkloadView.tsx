"use client";

import { useMemo } from "react";
import Link from "next/link";
import { addDays, format, startOfWeek } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { nextOccurrence, type RepeatFreq } from "@/lib/recurrence";
import { useTasks } from "@/hooks/useTasks";
import { useEvents } from "@/hooks/useEvents";
import { useCourses } from "@/hooks/useCourses";

const WEEKS = 16;

type WeekBucket = {
  key: string; // yyyy-MM-dd of the IST Monday
  label: string; // "Aug 17 – 23"
  start: TZDate;
  items: { title: string; color: string | null }[];
};

/**
 * "Which weeks are crushing" (spec 6.6): the next 16 weeks colored by how
 * many deliverables land in each — open tasks due + events (recurring series
 * expanded via the same arithmetic that spawns repeating tasks).
 */
export function WorkloadView({ tz }: { tz: string }) {
  const { data: tasks } = useTasks();
  const { data: events } = useEvents();
  const { data: courses } = useCourses();

  const weeks = useMemo<WeekBucket[]>(() => {
    const courseColor = (courseId: string | null) =>
      courses?.find((c) => c.id === courseId)?.color ?? null;

    const firstMonday = startOfWeek(new TZDate(new Date(), tz), { weekStartsOn: 1 });
    const buckets: WeekBucket[] = Array.from({ length: WEEKS }, (_, i) => {
      const start = addDays(firstMonday, i * 7) as TZDate;
      const end = addDays(start, 6);
      return {
        key: format(start, "yyyy-MM-dd"),
        label: `${format(start, "MMM d")} – ${format(end, format(start, "MMM") === format(end, "MMM") ? "d" : "MMM d")}`,
        start,
        items: [],
      };
    });
    const horizonEnd = addDays(firstMonday, WEEKS * 7);

    const bucketOf = (instant: Date): WeekBucket | null => {
      const zoned = new TZDate(instant, tz);
      const index = Math.floor(
        (startOfWeek(zoned, { weekStartsOn: 1 }).getTime() - firstMonday.getTime()) /
          (7 * 24 * 3600e3),
      );
      return index >= 0 && index < WEEKS ? buckets[index] : null;
    };

    for (const t of tasks ?? []) {
      if (t.status !== "TODO" || !t.dueAt) continue;
      bucketOf(new Date(t.dueAt))?.items.push({
        title: t.title,
        color: courseColor(t.courseId),
      });
    }

    for (const e of events ?? []) {
      const item = { title: e.title, color: courseColor(e.courseId) };
      if (!e.rrule) {
        bucketOf(new Date(e.startAt))?.items.push(item);
        continue;
      }
      // expand our limited rrule subset with the tested recurrence arithmetic
      const freq: RepeatFreq = /INTERVAL=2/.test(e.rrule)
        ? "BIWEEKLY"
        : /FREQ=MONTHLY/.test(e.rrule)
          ? "MONTHLY"
          : /FREQ=DAILY/.test(e.rrule)
            ? "DAILY"
            : "WEEKLY";
      const untilMatch = e.rrule.match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
      const until = untilMatch
        ? new Date(`${untilMatch[1]}-${untilMatch[2]}-${untilMatch[3]}T23:59:59Z`)
        : null;
      let occurrence = new Date(e.startAt);
      for (let i = 0; i < 200; i++) {
        if (occurrence >= horizonEnd) break;
        if (until && occurrence > until) break;
        bucketOf(occurrence)?.items.push(item);
        occurrence = nextOccurrence(occurrence, freq, tz);
      }
    }

    return buckets;
  }, [tasks, events, courses, tz]);

  const max = Math.max(1, ...weeks.map((w) => w.items.length));

  return (
    <div className="grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
      {weeks.map((week) => {
        const count = week.items.length;
        const crushing = count >= 6;
        const intensity = count === 0 ? 0 : 0.15 + 0.65 * (count / max);
        return (
          <Link
            key={week.key}
            href={`/calendar?date=${week.key}`}
            className="flex flex-col gap-1.5 rounded-xl border border-line p-3 transition-transform hover:scale-[1.02]"
            style={{
              backgroundColor:
                count === 0
                  ? "var(--color-panel)"
                  : crushing
                    ? `rgba(220, 38, 38, ${intensity * 0.35})`
                    : `rgba(79, 70, 229, ${intensity * 0.3})`,
            }}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-ink-muted">{week.label}</span>
              <span
                className={`text-lg font-semibold ${
                  crushing ? "text-danger" : count > 0 ? "text-accent" : "text-ink-faint"
                }`}
              >
                {count}
              </span>
            </div>
            <ul className="flex flex-col gap-0.5">
              {week.items.slice(0, 3).map((item, i) => (
                <li key={i} className="flex items-center gap-1 truncate text-[11px] text-ink-muted">
                  {item.color && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                  )}
                  <span className="truncate">{item.title}</span>
                </li>
              ))}
              {count > 3 && (
                <li className="text-[11px] text-ink-faint">+{count - 3} more</li>
              )}
            </ul>
          </Link>
        );
      })}
    </div>
  );
}
