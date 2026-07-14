import { z } from "zod";

/**
 * Structured output contract (spec §7) — shared between API validation, the
 * proposal gate, and the extraction backends. Datetimes are ISO 8601 UTC.
 */
export const ExtractedItem = z.object({
  kind: z.enum(["task", "event"]),
  title: z.string().max(120),
  dueAt: z.iso.datetime().nullable(), // tasks; null if undated
  startAt: z.iso.datetime().nullable(), // events
  endAt: z.iso.datetime().nullable(),
  allDay: z.boolean().default(false),
  courseGuess: z.string().nullable(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  confidence: z.number().min(0).max(1),
  sourceQuote: z.string().max(300),
});

export const ExtractionResult = z.object({
  items: z.array(ExtractedItem).max(60),
});

export type ExtractedItemT = z.infer<typeof ExtractedItem>;
export type ExtractionResultT = z.infer<typeof ExtractionResult>;
