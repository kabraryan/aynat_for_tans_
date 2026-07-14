import type { ExtractedItemT, ExtractionResultT } from "./schema";

/**
 * Merge chunked extraction results, deduping items the 1-page overlap made
 * both chunks see: same kind, same calendar day, ≥0.6 title-token overlap.
 * The higher-confidence copy wins.
 */
export function mergeResults(results: ExtractionResultT[]): ExtractionResultT {
  const merged: ExtractedItemT[] = [];
  for (const result of results) {
    for (const item of result.items) {
      const dupIndex = merged.findIndex((existing) => isDuplicate(existing, item));
      if (dupIndex === -1) {
        merged.push(item);
      } else if (item.confidence > merged[dupIndex].confidence) {
        merged[dupIndex] = item;
      }
    }
  }
  return { items: merged };
}

function isDuplicate(a: ExtractedItemT, b: ExtractedItemT): boolean {
  if (a.kind !== b.kind) return false;
  if (day(a) !== day(b)) return false;
  return titleOverlap(a.title, b.title) >= 0.6;
}

function day(item: ExtractedItemT): string | null {
  const iso = item.kind === "task" ? item.dueAt : item.startAt;
  return iso ? iso.slice(0, 10) : null;
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

/** Overlap relative to the smaller title, so "PS1" vs "PS1 due" still dedupes. */
function titleOverlap(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  let hit = 0;
  for (const t of small) if (large.has(t)) hit += 1;
  return hit / small.size;
}
