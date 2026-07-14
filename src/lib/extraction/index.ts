import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { buildPrompt, PROMPT_VERSION } from "@/lib/extraction/prompt";
import { ExtractionResult, type ExtractedItemT, type ExtractionResultT } from "@/lib/extraction/schema";
import { resolveBackend, type ExtractionBackend } from "@/lib/extraction/backends";
import { runValidated } from "@/lib/extraction/run";
import { chunkRanges, pageCount, splitPdf } from "@/lib/extraction/pdf";
import { mergeResults } from "@/lib/extraction/merge";
import type { Proposal } from "@/generated/prisma/client";

/**
 * The ONLY entry point that talks to an LLM (spec §7). Idempotent per source:
 * re-running replaces that source's PENDING proposals and never touches
 * accepted/rejected ones.
 */
export async function extractFromSource(sourceId: string): Promise<Proposal[]> {
  const source = await db.source.findUnique({
    where: { id: sourceId },
    include: { user: { select: { timezone: true } } },
  });
  if (!source) throw new Error(`Source ${sourceId} not found`);

  try {
    const backend = resolveBackend();
    const result = await withCache(source, backend.name, () =>
      runSource(backend, source),
    );
    const proposals = await writeProposals(source.id, source.userId, result.items);
    await db.source.update({
      where: { id: source.id },
      data: { status: "EXTRACTED", error: null },
    });
    return proposals;
  } catch (err) {
    await db.source.update({
      where: { id: source.id },
      data: {
        status: "FAILED",
        error: String(err instanceof Error ? err.message : err).slice(0, 500),
      },
    });
    throw err;
  }
}

type SourceWithUser = NonNullable<
  Awaited<ReturnType<typeof db.source.findUnique<{ where: { id: string }; include: { user: { select: { timezone: true } } } }>>>
>;

async function runSource(
  backend: ExtractionBackend,
  source: SourceWithUser,
): Promise<ExtractionResultT> {
  const tz = source.user.timezone;
  const now = new Date();
  const prompt = buildPrompt({
    nowISO: now.toISOString(),
    weekday: format(new TZDate(now, tz), "EEEE"),
    timezone: tz,
  });

  if (!source.fileKey) {
    return runValidated(backend, { prompt, text: source.excerpt ?? "" });
  }

  // EMAIL sources store the full message text via the storage adapter.
  if (source.mimeType === "text/plain") {
    const text = (await storage.get(source.fileKey)).toString("utf8");
    return runValidated(backend, { prompt, text });
  }

  // Large PDFs (syllabus mode, spec 6.4): chunk, extract sequentially, merge.
  if (source.mimeType === "application/pdf") {
    const bytes = await storage.get(source.fileKey);
    const ranges = chunkRanges(await pageCount(bytes));
    if (ranges.length > 1) {
      const chunks = await splitPdf(bytes, ranges);
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aynat-chunks-"));
      try {
        const results: ExtractionResultT[] = [];
        for (let i = 0; i < chunks.length; i++) {
          const chunkPath = path.join(tmpDir, `chunk-${i + 1}-of-${chunks.length}.pdf`);
          await fs.writeFile(chunkPath, chunks[i]);
          results.push(await runValidated(backend, { prompt, filePath: chunkPath }));
        }
        return mergeResults(results);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    }
  }

  return runValidated(backend, { prompt, filePath: storage.localPath!(source.fileKey) });
}

/** Content-hash cache: re-uploading the same file never re-runs the model. */
async function withCache(
  source: SourceWithUser,
  backendName: string,
  fn: () => Promise<ExtractionResultT>,
): Promise<ExtractionResultT> {
  let hash: string | null = null;
  if (source.type === "UPLOAD" && source.fileKey) {
    const bytes = await storage.get(source.fileKey);
    hash = crypto
      .createHash("sha256")
      .update(bytes)
      .update(`|${backendName}|${process.env.EXTRACTION_MODEL ?? "default"}|v${PROMPT_VERSION}`)
      .digest("hex");
    const cached = await db.extractionCache.findUnique({ where: { contentHash: hash } });
    if (cached) {
      const revalidated = ExtractionResult.safeParse(cached.resultJson);
      if (revalidated.success) return revalidated.data;
    }
  }
  const result = await fn();
  if (hash) {
    await db.extractionCache.upsert({
      where: { contentHash: hash },
      update: { resultJson: result },
      create: {
        contentHash: hash,
        resultJson: result,
        model: `${backendName}:${process.env.EXTRACTION_MODEL ?? "default"}`,
      },
    });
  }
  return result;
}

/** Stable hash of what an item proposes — dedupes re-extraction against
 *  already-resolved proposals so accepted items aren't re-proposed. */
export function payloadHash(item: ExtractedItemT): string {
  const normalized = JSON.stringify({
    kind: item.kind,
    title: item.title.trim().toLowerCase(),
    dueAt: item.dueAt,
    startAt: item.startAt,
    endAt: item.endAt,
    allDay: item.allDay,
  });
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

async function writeProposals(
  sourceId: string,
  userId: string,
  items: ExtractedItemT[],
): Promise<Proposal[]> {
  return db.$transaction(async (tx) => {
    // replace-pending semantics; accepted/rejected are never touched
    await tx.proposal.deleteMany({ where: { sourceId, status: "PENDING" } });

    const resolved = await tx.proposal.findMany({
      where: { sourceId, status: { in: ["ACCEPTED", "REJECTED"] } },
      select: { payloadHash: true },
    });
    const resolvedHashes = new Set(resolved.map((p) => p.payloadHash));

    const created: Proposal[] = [];
    for (const item of items) {
      const hash = payloadHash(item);
      if (resolvedHashes.has(hash)) continue;
      created.push(
        await tx.proposal.create({
          data: {
            userId,
            sourceId,
            kind: item.kind === "task" ? "TASK" : "EVENT",
            payload: item,
            payloadHash: hash,
            confidence: item.confidence,
          },
        }),
      );
    }
    return created;
  });
}
