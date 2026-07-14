"use client";

import { useEffect } from "react";
import { formatDueLabel } from "@/lib/dates";
import { dueReminders, reminderKey, type RemindableItem } from "@/lib/reminders";
import type { Task } from "@/hooks/useTasks";
import type { CalEvent } from "@/hooks/useEvents";

const ENABLED_KEY = "aynat:reminders";
const SENT_KEY = "aynat:reminders:sent";
const CHECK_MS = 60_000;

export function remindersEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    Notification.permission === "granted" &&
    localStorage.getItem(ENABLED_KEY) === "1"
  );
}

export function setRemindersEnabled(on: boolean) {
  localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
}

function loadSent(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SENT_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveSent(sent: Set<string>) {
  // keep the log bounded
  localStorage.setItem(SENT_KEY, JSON.stringify([...sent].slice(-500)));
}

/** Mounted app-wide: checks every minute while a tab is open. */
export function ReminderWatcher({ tz }: { tz: string }) {
  useEffect(() => {
    async function check() {
      if (!remindersEnabled()) return;
      try {
        const [tasks, events] = await Promise.all([
          fetch("/api/tasks").then((r) => r.json() as Promise<Task[]>),
          fetch("/api/events").then((r) => r.json() as Promise<CalEvent[]>),
        ]);
        const items: RemindableItem[] = [
          ...tasks
            .filter((t) => t.status === "TODO" && t.dueAt)
            .map((t) => ({
              kind: "task" as const,
              id: t.id,
              title: t.title,
              at: t.dueAt!,
              allDay: t.allDayDue,
            })),
          ...events
            .filter((e) => !e.rrule) // recurring series: next-occurrence support later
            .map((e) => ({
              kind: "event" as const,
              id: e.id,
              title: e.title,
              at: e.startAt,
              allDay: e.allDay,
            })),
        ];

        const sent = loadSent();
        for (const item of dueReminders(items, new Date(), tz, sent)) {
          new Notification(item.kind === "task" ? "Task due" : "Upcoming event", {
            body: `${item.title} — ${formatDueLabel(new Date(item.at), item.allDay, tz)}`,
            tag: reminderKey(item),
          });
          sent.add(reminderKey(item));
        }
        saveSent(sent);
      } catch {
        // network hiccup — try again next tick
      }
    }

    check();
    const timer = setInterval(check, CHECK_MS);
    return () => clearInterval(timer);
  }, [tz]);

  return null;
}
