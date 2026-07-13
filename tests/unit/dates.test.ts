import { describe, it, expect } from "vitest";
import { userDayKey, fromWallTime, dueGroup } from "@/lib/dates";

const IST = "Asia/Kolkata";
const NY = "America/New_York";

describe("userDayKey", () => {
  it("maps a UTC instant to its calendar day in the user timezone", () => {
    // 18:29Z = 23:59 IST — still July 13 in India
    expect(userDayKey(new Date("2026-07-13T18:29:00Z"), IST)).toBe("2026-07-13");
  });

  it("rolls to the next day across the IST midnight boundary", () => {
    // 18:31Z = 00:01 IST July 14
    expect(userDayKey(new Date("2026-07-13T18:31:00Z"), IST)).toBe("2026-07-14");
  });

  it("works in a DST timezone (module is not IST-hardcoded)", () => {
    // 01:30 EST on the US spring-forward day
    expect(userDayKey(new Date("2026-03-08T06:30:00Z"), NY)).toBe("2026-03-08");
    // 23:30 EDT the evening after the jump — still March 8 locally, March 9 UTC
    expect(userDayKey(new Date("2026-03-09T03:30:00Z"), NY)).toBe("2026-03-08");
  });
});

describe("fromWallTime", () => {
  it("converts a date-only wall time to midnight in the user tz (UTC instant)", () => {
    expect(fromWallTime("2026-07-14", null, IST).toISOString()).toBe(
      "2026-07-13T18:30:00.000Z",
    );
  });

  it("converts a timed wall time to the correct UTC instant", () => {
    expect(fromWallTime("2026-07-14", "09:00", IST).toISOString()).toBe(
      "2026-07-14T03:30:00.000Z",
    );
  });

  it("respects DST offsets", () => {
    // March 8 2026 is the US spring-forward day; 14:00 is EDT (UTC-4)
    expect(fromWallTime("2026-03-08", "14:00", NY).toISOString()).toBe(
      "2026-03-08T18:00:00.000Z",
    );
  });

  it("round-trips with userDayKey", () => {
    const instant = fromWallTime("2026-09-01", null, IST);
    expect(userDayKey(instant, IST)).toBe("2026-09-01");
  });
});

describe("dueGroup", () => {
  // Monday 2026-07-13, 15:30 IST
  const now = new Date("2026-07-13T10:00:00Z");

  it("returns none for undated tasks", () => {
    expect(dueGroup(null, now, IST)).toBe("none");
  });

  it("returns overdue for a due date on an earlier user-tz day", () => {
    expect(dueGroup(new Date("2026-07-12T12:00:00Z"), now, IST)).toBe("overdue");
  });

  it("returns today for the same user-tz day, even if the time has passed", () => {
    // 08:30 IST — earlier than now (15:30 IST) but still today
    expect(dueGroup(new Date("2026-07-13T03:00:00Z"), now, IST)).toBe("today");
    // 23:30 IST tonight
    expect(dueGroup(new Date("2026-07-13T18:00:00Z"), now, IST)).toBe("today");
  });

  it("classifies just-past-IST-midnight as tomorrow (thisWeek), not today", () => {
    // 00:15 IST Tuesday July 14
    expect(dueGroup(new Date("2026-07-13T18:45:00Z"), now, IST)).toBe("thisWeek");
  });

  it("includes the end of the ISO week (Sunday) in thisWeek", () => {
    // Sunday July 19, 15:30 IST
    expect(dueGroup(new Date("2026-07-19T10:00:00Z"), now, IST)).toBe("thisWeek");
  });

  it("returns later for the following Monday", () => {
    expect(dueGroup(new Date("2026-07-20T10:00:00Z"), now, IST)).toBe("later");
  });

  it("on a Sunday, tomorrow belongs to later (new week)", () => {
    const sunday = new Date("2026-07-19T10:00:00Z"); // Sunday 15:30 IST
    expect(dueGroup(new Date("2026-07-20T10:00:00Z"), sunday, IST)).toBe("later");
  });
});
