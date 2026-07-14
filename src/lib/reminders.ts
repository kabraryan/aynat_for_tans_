import { TZDate } from "@date-fns/tz";

/**
 * Reminder policy (Phase 5.4): timed tasks 24h before the due instant;
 * all-day tasks at 18:00 in the user's tz the evening before; events 60
 * minutes before start. A reminder fires once (callers persist sent keys)
 * and never after the item's own time has passed.
 */

export type RemindableItem = {
  kind: "task" | "event";
  id: string;
  title: string;
  at: string; // ISO UTC — dueAt for tasks, startAt for events
  allDay: boolean;
};

export function reminderKey(item: RemindableItem): string {
  return `${item.kind}:${item.id}:${item.at}`;
}

export function remindAt(item: RemindableItem, tz: string): Date {
  const at = new Date(item.at);
  if (item.kind === "event") return new Date(at.getTime() - 60 * 60e3);
  if (!item.allDay) return new Date(at.getTime() - 24 * 3600e3);
  // all-day dues are midnight-anchored in the user tz → 18:00 the prior evening
  const zoned = new TZDate(at, tz);
  const evening = new TZDate(
    zoned.getFullYear(),
    zoned.getMonth(),
    zoned.getDate() - 1,
    18,
    0,
    0,
    tz,
  );
  return new Date(evening.getTime());
}

export function dueReminders(
  items: RemindableItem[],
  now: Date,
  tz: string,
  sent: ReadonlySet<string>,
): RemindableItem[] {
  return items.filter((item) => {
    if (sent.has(reminderKey(item))) return false;
    const at = new Date(item.at);
    if (now >= at) return false; // too late to be useful
    return now >= remindAt(item, tz);
  });
}
