import { describe, it, expect } from "vitest";
import { parseQuickAdd } from "@/lib/quickadd";

const IST = "Asia/Kolkata";
// Tuesday 2026-07-14, 15:30 IST
const now = new Date("2026-07-14T10:00:00Z");
const courses = [
  { id: "c1", name: "Data Structures", code: "CS201" },
  { id: "c2", name: "Mechanics", code: "PHY102" },
];

const parse = (input: string) => parseQuickAdd(input, { now, tz: IST, courses });

describe("parseQuickAdd", () => {
  it("parses a weekday + time into a timed IST due", () => {
    const r = parse("finish ps4 friday 5pm");
    expect(r.title).toBe("finish ps4");
    // Friday after Tue Jul 14 is Jul 17; 17:00 IST = 11:30Z
    expect(r.dueAt).toBe("2026-07-17T11:30:00.000Z");
    expect(r.allDayDue).toBe(false);
  });

  it("parses a bare date word as an all-day due", () => {
    const r = parse("read chapter 6 tomorrow");
    expect(r.title).toBe("read chapter 6");
    // Wed Jul 15 IST midnight = Jul 14 18:30Z
    expect(r.dueAt).toBe("2026-07-14T18:30:00.000Z");
    expect(r.allDayDue).toBe(true);
  });

  it("resolves weekday names forward, matches #course by code, strips the tag", () => {
    const r = parse("#cs201 quiz prep monday");
    expect(r.courseId).toBe("c1");
    expect(r.title).toBe("quiz prep");
    expect(r.dueAt).toBe("2026-07-19T18:30:00.000Z"); // Mon Jul 20 IST, all-day
  });

  it("matches #course by squashed name", () => {
    const r = parse("#datastructures review notes");
    expect(r.courseId).toBe("c1");
    expect(r.title).toBe("review notes");
  });

  it("parses !priority", () => {
    const r = parse("submit report !high aug 3");
    expect(r.priority).toBe("HIGH");
    expect(r.title).toBe("submit report");
    expect(r.dueAt).toBe("2026-08-02T18:30:00.000Z"); // Aug 3 IST all-day
  });

  it("leaves plain input untouched", () => {
    const r = parse("buy groceries");
    expect(r).toEqual({
      title: "buy groceries",
      dueAt: null,
      allDayDue: false,
      priority: "MEDIUM",
      courseId: null,
    });
  });

  it("strips dangling connector words left behind by the date", () => {
    const r = parse("essay due friday");
    expect(r.title).toBe("essay");
    expect(r.dueAt).toBe("2026-07-16T18:30:00.000Z"); // Fri Jul 17 IST all-day
  });

  it("unknown #tag stays in the title and matches no course", () => {
    const r = parse("#chem lab writeup");
    expect(r.courseId).toBeNull();
    expect(r.title).toBe("#chem lab writeup");
  });
});
