import { describe, it, expect } from "vitest";
import { mergeResults } from "@/lib/extraction/merge";
import type { ExtractedItemT } from "@/lib/extraction/schema";

function item(overrides: Partial<ExtractedItemT>): ExtractedItemT {
  return {
    kind: "task",
    title: "Problem Set 1",
    dueAt: "2026-08-17T18:29:00Z",
    startAt: null,
    endAt: null,
    allDay: true,
    courseGuess: null,
    priority: "medium",
    confidence: 0.9,
    sourceQuote: "PS1 due Aug 17",
    ...overrides,
  };
}

describe("mergeResults", () => {
  it("concatenates disjoint chunk results", () => {
    const merged = mergeResults([
      { items: [item({ title: "Problem Set 1" })] },
      { items: [item({ title: "Problem Set 2", dueAt: "2026-08-31T18:29:00Z" })] },
    ]);
    expect(merged.items).toHaveLength(2);
  });

  it("dedupes overlap items (same kind + day + similar title), keeping higher confidence", () => {
    const merged = mergeResults([
      { items: [item({ title: "Problem Set 1", confidence: 0.7 })] },
      { items: [item({ title: "Problem Set 1 due", confidence: 0.95 })] },
    ]);
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0].confidence).toBe(0.95);
  });

  it("does not dedupe same title on different days (recurring-style items)", () => {
    const merged = mergeResults([
      { items: [item({ title: "Weekly quiz", dueAt: "2026-08-17T18:29:00Z" })] },
      { items: [item({ title: "Weekly quiz", dueAt: "2026-08-24T18:29:00Z" })] },
    ]);
    expect(merged.items).toHaveLength(2);
  });

  it("does not dedupe a task against an event on the same day", () => {
    const merged = mergeResults([
      { items: [item({ title: "Midterm", kind: "task" })] },
      {
        items: [
          item({
            title: "Midterm",
            kind: "event",
            dueAt: null,
            startAt: "2026-08-17T04:30:00Z",
            endAt: "2026-08-17T06:00:00Z",
          }),
        ],
      },
    ]);
    expect(merged.items).toHaveLength(2);
  });
});
