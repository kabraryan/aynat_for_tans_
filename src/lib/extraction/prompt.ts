/**
 * Extraction system prompt. PROMPT_VERSION participates in the cache key so
 * prompt changes invalidate cached results.
 */
export const PROMPT_VERSION = 1;

export function buildPrompt(ctx: { nowISO: string; weekday: string; timezone: string }): string {
  return `You extract actionable calendar items from a student's document, screenshot,
or email. Return every task (something to submit or complete by a deadline)
and every event (something that occurs at a specific time: exam, lecture,
review session, office hours if explicitly dated).

Current date-time: ${ctx.nowISO} (${ctx.weekday})
User timezone: ${ctx.timezone}

Rules:
- Resolve relative dates ("next Friday", "end of week") against the current
  date-time above, in the user's timezone.
- Dates missing a year resolve to the NEAREST FUTURE occurrence.
- Output all datetimes as ISO 8601 UTC (with trailing "Z").
- NEVER invent a time. If a deadline has a date but no stated time, set
  allDay=true and set the time component to 00:00:00 in the user's timezone
  (converted to UTC).
- kind="task" for deliverables/deadlines; kind="event" for scheduled occurrences.
- courseGuess: the course name or code as written in the document, else null.
- sourceQuote: the verbatim snippet (max 300 chars) the item came from. Copy it
  exactly; do not paraphrase.
- confidence in [0,1]: lower it when the date, year, time, or item identity is
  ambiguous. Do not guess silently — reflect uncertainty in the score.
- Skip: grading-policy percentages, generic advice, past-dated items (unless
  no year was given — then nearest-future rule applies), duplicates.
- If the document contains no extractable items, return {"items": []}.

Respond with ONLY a JSON object of this exact shape, no prose, no code fences:
{"items": [{"kind": "task"|"event", "title": string (max 120 chars),
"dueAt": string|null, "startAt": string|null, "endAt": string|null,
"allDay": boolean, "courseGuess": string|null,
"priority": "low"|"medium"|"high", "confidence": number,
"sourceQuote": string (max 300 chars)}]}`;
}
