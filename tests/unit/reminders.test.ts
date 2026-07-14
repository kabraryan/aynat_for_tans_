import { describe, it, expect } from "vitest";
import { dueReminders, reminderKey, type RemindableItem } from "@/lib/reminders";

const IST = "Asia/Kolkata";

const timedTask: RemindableItem = {
  kind: "task",
  id: "t1",
  title: "Submit report",
  at: "2026-07-17T11:30:00Z", // Fri 17:00 IST
  allDay: false,
};
const allDayTask: RemindableItem = {
  kind: "task",
  id: "t2",
  title: "Problem Set 1",
  at: "2026-07-16T18:30:00Z", // Fri Jul 17 IST, midnight-anchored
  allDay: true,
};
const event: RemindableItem = {
  kind: "event",
  id: "e1",
  title: "Quiz 1",
  at: "2026-07-17T04:30:00Z", // Fri 10:00 IST
  allDay: false,
};

describe("dueReminders", () => {
  it("timed tasks remind 24h before the due instant", () => {
    const before = new Date("2026-07-16T11:00:00Z"); // 24h29m early — not yet
    const within = new Date("2026-07-16T12:00:00Z"); // 23h30m early — fire
    expect(dueReminders([timedTask], before, IST, new Set())).toHaveLength(0);
    expect(dueReminders([timedTask], within, IST, new Set())).toHaveLength(1);
  });

  it("all-day tasks remind at 18:00 IST the evening before", () => {
    const before = new Date("2026-07-16T12:00:00Z"); // 17:30 IST — not yet
    const within = new Date("2026-07-16T12:45:00Z"); // 18:15 IST — fire
    expect(dueReminders([allDayTask], before, IST, new Set())).toHaveLength(0);
    expect(dueReminders([allDayTask], within, IST, new Set())).toHaveLength(1);
  });

  it("events remind 60 minutes before start", () => {
    const before = new Date("2026-07-17T03:15:00Z"); // 75m early — not yet
    const within = new Date("2026-07-17T03:45:00Z"); // 45m early — fire
    expect(dueReminders([event], before, IST, new Set())).toHaveLength(0);
    expect(dueReminders([event], within, IST, new Set())).toHaveLength(1);
  });

  it("never reminds after the item's time has passed", () => {
    const after = new Date("2026-07-17T05:00:00Z"); // quiz started 30m ago
    expect(dueReminders([event], after, IST, new Set())).toHaveLength(0);
  });

  it("skips already-sent reminders", () => {
    const within = new Date("2026-07-17T03:45:00Z");
    const sent = new Set([reminderKey(event)]);
    expect(dueReminders([event], within, IST, sent)).toHaveLength(0);
  });
});
