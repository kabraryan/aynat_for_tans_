import crypto from "node:crypto";
import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { buildPrompt, PROMPT_VERSION } from "@/lib/extraction/prompt";
import { ExtractionResult, type ExtractedItemT, type ExtractionResultT } from "@/lib/extraction/schema";
import { resolveBackend, type ExtractionInput } from "@/lib/extraction/backends";
import { runValidated } from "@/lib/extraction/run";
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
    const input = await buildInput(source);
    const result = await withCache(source, backend.name, () =>
      runValidated(backend, input),
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

async function buildInput(source: SourceWithUser): Promise<ExtractionInput & { bytes: Buffer | null }> {
  const tz = source.user.timezone;
  const now = new Date();
  const prompt = buildPrompt({
    nowISO: now.toISOString(),
    weekday: format(new TZDate(now, tz), "EEEE"),
    timezone: tz,
  });

  if (source.type === "UPLOAD" && source.fileKey) {
    const bytes = await storage.get(source.fileKey);
    return { prompt, filePath: storage.localPath!(source.fileKey), bytes };
  }
  // EMAIL sources (Phase 4) carry their text in `excerpt`'s full-body sibling;
  // for now the excerpt is the text.
  return { prompt, text: source.excerpt ?? "", bytes: null };
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
