/**
 * Fixture-based extraction evaluation (plan §6). Runs each fixture through
 * the configured extraction backend (EXTRACTION_BACKEND, default "agent")
 * and scores the result against fixtures/expected/*.json.
 *
 * Usage: pnpm eval            (all fixtures)
 *        pnpm eval syllabus   (fixtures whose name contains "syllabus")
 *
 * Matching rule: an expected item is hit when some predicted item has the
 * same kind, the same IST calendar day, and ≥0.6 of the expected title's
 * tokens present in the predicted title.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { buildPrompt } from "../src/lib/extraction/prompt";
import { resolveBackend } from "../src/lib/extraction/backends";
import { runValidated } from "../src/lib/extraction/run";
import type { ExtractedItemT } from "../src/lib/extraction/schema";

const TZ = "Asia/Kolkata";
const FIXTURES = path.resolve(__dirname, "../fixtures");

type Expected = {
  file: string;
  items: { kind: "task" | "event"; title: string; dayIST: string | null }[];
};

function dayIST(iso: string | null): string | null {
  return iso ? format(new TZDate(new Date(iso), TZ), "yyyy-MM-dd") : null;
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

function titleMatches(expected: string, predicted: string): boolean {
  const exp = tokens(expected);
  const pred = tokens(predicted);
  if (exp.size === 0) return false;
  let hit = 0;
  for (const t of exp) if (pred.has(t)) hit += 1;
  return hit / exp.size >= 0.6;
}

function itemDay(item: ExtractedItemT): string | null {
  return dayIST(item.kind === "task" ? item.dueAt : item.startAt);
}

async function evalFixture(expected: Expected) {
  const backend = resolveBackend();
  const prompt = buildPrompt({
    nowISO: new Date().toISOString(),
    weekday: format(new TZDate(new Date(), TZ), "EEEE"),
    timezone: TZ,
  });
  const filePath = path.join(FIXTURES, expected.file);
  const t0 = Date.now();
  const result = await runValidated(backend, { prompt, filePath });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const predicted = [...result.items];
  const misses: string[] = [];
  let hits = 0;
  for (const exp of expected.items) {
    const idx = predicted.findIndex(
      (p) => p.kind === exp.kind && itemDay(p) === exp.dayIST && titleMatches(exp.title, p.title),
    );
    if (idx === -1) {
      misses.push(`${exp.kind} "${exp.title}" @ ${exp.dayIST}`);
    } else {
      hits += 1;
      predicted.splice(idx, 1); // consume — no double matching
    }
  }

  const recall = hits / expected.items.length;
  const precision = result.items.length === 0 ? 0 : hits / result.items.length;
  const f1 = recall + precision === 0 ? 0 : (2 * recall * precision) / (recall + precision);

  console.log(`\n${expected.file}  (${elapsed}s)`);
  console.log(
    `  recall ${(recall * 100).toFixed(0)}%  precision ${(precision * 100).toFixed(0)}%  F1 ${(f1 * 100).toFixed(0)}%  (${hits}/${expected.items.length} expected, ${result.items.length} predicted)`,
  );
  for (const m of misses) console.log(`  MISS   ${m}`);
  for (const extra of predicted)
    console.log(`  EXTRA  ${extra.kind} "${extra.title}" @ ${itemDay(extra)}`);

  return { recall, precision, hits, expected: expected.items.length, predicted: result.items.length };
}

async function main() {
  const filter = process.argv[2];
  const dir = path.join(FIXTURES, "expected");
  const files = (await fs.readdir(dir)).filter(
    (f) => f.endsWith(".json") && (!filter || f.includes(filter)),
  );
  if (files.length === 0) {
    console.error("No fixtures matched.");
    process.exit(1);
  }
  console.log(`Backend: ${process.env.EXTRACTION_BACKEND ?? "agent"} · ${files.length} fixture(s)`);

  let hits = 0,
    expectedTotal = 0,
    predictedTotal = 0;
  for (const f of files) {
    const expected = JSON.parse(await fs.readFile(path.join(dir, f), "utf8")) as Expected;
    const r = await evalFixture(expected);
    hits += r.hits;
    expectedTotal += r.expected;
    predictedTotal += r.predicted;
  }

  const recall = hits / expectedTotal;
  const precision = predictedTotal === 0 ? 0 : hits / predictedTotal;
  console.log(
    `\nAGGREGATE  recall ${(recall * 100).toFixed(0)}%  precision ${(precision * 100).toFixed(0)}%  (${hits}/${expectedTotal} expected, ${predictedTotal} predicted)`,
  );
  // Phase 3 exit bar (spec 6.4): ≥90% recall on syllabus fixtures
  process.exit(recall >= 0.9 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
