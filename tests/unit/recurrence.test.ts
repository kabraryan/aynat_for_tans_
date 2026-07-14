import { describe, it, expect } from "vitest";
import { nextOccurrence } from "@/lib/recurrence";

const IST = "Asia/Kolkata";

describe("nextOccurrence", () => {
  it("weekly adds 7 days, preserving the IST wall time", () => {
    // Fri Jul 17, 17:00 IST
    const next = nextOccurrence(new Date("2026-07-17T11:30:00Z"), "WEEKLY", IST);
    expect(next.toISOString()).toBe("2026-07-24T11:30:00.000Z");
  });

  it("biweekly adds 14 days", () => {
    const next = nextOccurrence(new Date("2026-07-17T11:30:00Z"), "BIWEEKLY", IST);
    expect(next.toISOString()).toBe("2026-07-31T11:30:00.000Z");
  });

  it("daily adds a day", () => {
    const next = nextOccurrence(new Date("2026-07-17T11:30:00Z"), "DAILY", IST);
    expect(next.toISOString()).toBe("2026-07-18T11:30:00.000Z");
  });

  it("monthly clamps to the shorter month's end", () => {
    // Jan 31 midnight IST -> Feb 28 (2027 not a leap year)
    const next = nextOccurrence(new Date("2027-01-30T18:30:00Z"), "MONTHLY", IST);
    expect(next.toISOString()).toBe("2027-02-27T18:30:00.000Z"); // Feb 28 IST midnight
  });

  it("preserves wall time across a DST change in a DST timezone", () => {
    // Sat Mar 7 2026 09:00 America/New_York (EST, UTC-5) -> weekly
    // -> Sat Mar 14 09:00 EDT (UTC-4) because DST starts Mar 8
    const next = nextOccurrence(
      new Date("2026-03-07T14:00:00Z"),
      "WEEKLY",
      "America/New_York",
    );
    expect(next.toISOString()).toBe("2026-03-14T13:00:00.000Z");
  });
});
