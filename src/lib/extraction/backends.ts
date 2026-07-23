import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export type ExtractionInput = {
  prompt: string;
  /** Local file (image/pdf) for vision-based extraction. */
  filePath?: string;
  /** Raw text (email bodies, Phase 4). */
  text?: string;
  /** Appended on retry after a schema-validation failure. */
  correction?: string;
};

export interface ExtractionBackend {
  /** Participates in the cache key. */
  name: string;
  /** Returns the model's raw text response (expected to be JSON). */
  extract(input: ExtractionInput): Promise<string>;
}

/**
 * Dev backend: no credentials, deterministic canned proposals so the whole
 * upload → review → accept pipeline can run locally at zero cost.
 */
export const stubBackend: ExtractionBackend = {
  name: "stub",
  async extract() {
    const day = 24 * 3600e3;
    const at = (offsetDays: number, h: number, m = 0) => {
      const d = new Date(Date.now() + offsetDays * day);
      d.setUTCHours(h, m, 0, 0);
      return d.toISOString();
    };
    return JSON.stringify({
      items: [
        {
          kind: "task",
          title: "Problem Set 4",
          dueAt: at(2, 18, 30), // midnight IST two days out
          startAt: null,
          endAt: null,
          allDay: true,
          courseGuess: "CS201",
          priority: "high",
          confidence: 0.92,
          sourceQuote: "[stub] Problem Set 4 due Friday at midnight",
        },
        {
          kind: "event",
          title: "Midterm review session",
          dueAt: null,
          startAt: at(4, 4, 30), // 10:00 IST
          endAt: at(4, 6, 0), // 11:30 IST
          allDay: false,
          courseGuess: "CS201",
          priority: "medium",
          confidence: 0.85,
          sourceQuote: "[stub] Review session Thursday 10-11:30am, room 204",
        },
        {
          kind: "task",
          title: "Read chapter 6 before lab",
          dueAt: at(3, 18, 30),
          startAt: null,
          endAt: null,
          allDay: true,
          courseGuess: null,
          priority: "medium",
          confidence: 0.55, // exercises the "check this" badge
          sourceQuote: "[stub] finish the reading before next lab maybe?",
        },
      ],
    });
  },
};

/**
 * Agent backend: drives the locally-authenticated Claude Code CLI headlessly,
 * so extraction runs on the user's subscription with no API key. Local dev
 * only — a deployed server has no CLI login (use the api backend there).
 */
export const agentBackend: ExtractionBackend = {
  name: "agent",
  async extract(input: ExtractionInput): Promise<string> {
    const parts = [input.prompt];
    if (input.filePath) {
      parts.push(
        `\nThe document to extract from is the file at: ${input.filePath}\nRead that file first, then respond with the JSON only.`,
      );
    }
    if (input.text) {
      parts.push(`\nDocument text:\n"""\n${input.text}\n"""`);
    }
    if (input.correction) {
      parts.push(`\nYour previous response failed validation:\n${input.correction}\nRespond again with corrected JSON only.`);
    }

    const { stdout } = await run(
      "claude",
      [
        "-p",
        parts.join("\n"),
        "--output-format",
        "json",
        "--max-turns",
        "6",
        "--allowedTools",
        "Read",
        "--permission-mode",
        "bypassPermissions",
        ...(process.env.EXTRACTION_MODEL
          ? ["--model", process.env.EXTRACTION_MODEL]
          : []),
      ],
      { timeout: 240_000, maxBuffer: 16 * 1024 * 1024 },
    );

    const envelope = JSON.parse(stdout) as {
      is_error: boolean;
      result?: string;
      subtype?: string;
    };
    if (envelope.is_error || typeof envelope.result !== "string") {
      throw new Error(`agent extraction failed (${envelope.subtype ?? "unknown"})`);
    }
    return envelope.result;
  },
};

export function resolveBackend(): ExtractionBackend {
  const which = process.env.EXTRACTION_BACKEND ?? "agent";
  switch (which) {
    case "stub":
      return stubBackend;
    case "agent":
      return agentBackend;
    case "api":
      // Messages API backend lands when a paid key is configured (deploy path).
      throw new Error("EXTRACTION_BACKEND=api is not implemented yet — use 'agent' or 'stub'");
    default:
      throw new Error(`Unknown EXTRACTION_BACKEND: ${which}`);
  }
}
