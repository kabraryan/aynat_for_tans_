import { db } from "@/lib/db";
import { ExtractedItem, type ExtractedItemT } from "@/lib/extraction/schema";
import type { Task, Event, Proposal } from "@/generated/prisma/client";

/**
 * THE GATE (spec §10.1). Accepting a proposal is the only code path that
 * creates a Task/Event carrying a sourceId. Edits are re-validated through
 * the ExtractedItem schema before anything is written; everything happens in
 * one transaction so a proposal can never be double-accepted.
 */

const PRIORITY = { low: "LOW", medium: "MEDIUM", high: "HIGH" } as const;

export type AcceptResult =
  | { ok: true; kind: "task"; task: Task }
  | { ok: true; kind: "event"; event: Event }
  | { ok: false; code: "not_found" | "already_resolved" | "invalid_payload" | "missing_start"; message: string };

export async function acceptProposal(
  userId: string,
  proposalId: string,
  opts: {
    edits?: Partial<ExtractedItemT>;
    courseId?: string | null;
    /** True when the confidence policy (not a user click) is accepting. */
    autoAccepted?: boolean;
  } = {},
): Promise<AcceptResult> {
  const proposal = await db.proposal.findFirst({ where: { id: proposalId, userId } });
  if (!proposal) return { ok: false, code: "not_found", message: "Proposal not found" };
  if (proposal.status !== "PENDING")
    return { ok: false, code: "already_resolved", message: "Proposal was already resolved" };

  const merged = ExtractedItem.safeParse({ ...(proposal.payload as object), ...opts.edits });
  if (!merged.success)
    return { ok: false, code: "invalid_payload", message: "Edits failed validation" };
  const item = merged.data;

  // courseId is scoped to this user; unknown ids are dropped, never trusted
  const courseId = opts.courseId
    ? ((await db.course.findFirst({ where: { id: opts.courseId, userId } }))?.id ?? null)
    : null;

  if (item.kind === "event" && !item.startAt)
    return { ok: false, code: "missing_start", message: "Event needs a start time — edit it first" };

  return db.$transaction(async (tx) => {
    // guard against a concurrent accept of the same proposal
    const { count } = await tx.proposal.updateMany({
      where: { id: proposal.id, status: "PENDING" },
      data: {
        status: "ACCEPTED",
        resolvedAt: new Date(),
        autoAccepted: opts.autoAccepted ?? false,
      },
    });
    if (count === 0)
      return { ok: false as const, code: "already_resolved" as const, message: "Proposal was already resolved" };

    if (item.kind === "task") {
      const task = await tx.task.create({
        data: {
          userId,
          courseId,
          title: item.title,
          dueAt: item.dueAt ? new Date(item.dueAt) : null,
          allDayDue: item.allDay,
          priority: PRIORITY[item.priority],
          sourceId: proposal.sourceId,
        },
      });
      await tx.proposal.update({ where: { id: proposal.id }, data: { acceptedItemId: task.id } });
      return { ok: true as const, kind: "task" as const, task };
    }

    const startAt = new Date(item.startAt!);
    const endAt = item.endAt ? new Date(item.endAt) : new Date(startAt.getTime() + 3600e3);
    const event = await tx.event.create({
      data: {
        userId,
        courseId,
        title: item.title,
        startAt,
        endAt: endAt >= startAt ? endAt : startAt,
        allDay: item.allDay,
        sourceId: proposal.sourceId,
      },
    });
    await tx.proposal.update({ where: { id: proposal.id }, data: { acceptedItemId: event.id } });
    return { ok: true as const, kind: "event" as const, event };
  });
}

/**
 * AUTO-ACCEPT POLICY (opt-in, Settings → Gmail). Not a new write path: it
 * calls acceptProposal — the same gate — for EMAIL-source proposals whose
 * confidence clears the bar. Everything below the bar stays PENDING for
 * review, and every auto-accept is tagged + undoable (undoAutoAccept).
 */
export const AUTO_ACCEPT_MIN_CONFIDENCE = Number(
  process.env.AUTO_ACCEPT_MIN_CONFIDENCE ?? 0.9,
);

export async function autoAcceptConfident(
  sourceId: string,
): Promise<{ accepted: number; considered: number }> {
  const source = await db.source.findUnique({
    where: { id: sourceId },
    select: { id: true, userId: true, type: true },
  });
  // uploads are deliberate user actions with the review screen right there —
  // the policy applies to background email ingestion only
  if (!source || source.type !== "EMAIL") return { accepted: 0, considered: 0 };

  const prefs = await db.gmailSyncState.findUnique({ where: { userId: source.userId } });
  if (!prefs?.autoAccept) return { accepted: 0, considered: 0 };

  const confident = await db.proposal.findMany({
    where: {
      userId: source.userId,
      sourceId: source.id,
      status: "PENDING",
      confidence: { gte: AUTO_ACCEPT_MIN_CONFIDENCE },
    },
    orderBy: { createdAt: "asc" },
  });

  let accepted = 0;
  for (const p of confident) {
    const result = await acceptProposal(source.userId, p.id, {
      courseId: await guessCourseId(source.userId, p),
      autoAccepted: true,
    });
    if (result.ok) accepted += 1;
    // failures (e.g. event missing a start time) simply stay PENDING for review
  }
  return { accepted, considered: confident.length };
}

export async function undoAutoAccept(
  userId: string,
  proposalId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const proposal = await db.proposal.findFirst({
    where: { id: proposalId, userId, status: "ACCEPTED", autoAccepted: true },
  });
  if (!proposal)
    return { ok: false, message: "Not an auto-accepted proposal (or already undone)" };

  await db.$transaction(async (tx) => {
    if (proposal.acceptedItemId) {
      // deleteMany: no-op if the user already deleted the item themselves
      if (proposal.kind === "TASK")
        await tx.task.deleteMany({ where: { id: proposal.acceptedItemId, userId } });
      else await tx.event.deleteMany({ where: { id: proposal.acceptedItemId, userId } });
    }
    await tx.proposal.update({
      where: { id: proposal.id },
      data: { status: "PENDING", resolvedAt: null, autoAccepted: false, acceptedItemId: null },
    });
  });
  return { ok: true };
}

export async function rejectProposal(
  userId: string,
  proposalId: string,
): Promise<{ ok: boolean; message?: string }> {
  const { count } = await db.proposal.updateMany({
    where: { id: proposalId, userId, status: "PENDING" },
    data: { status: "REJECTED", resolvedAt: new Date() },
  });
  return count === 1 ? { ok: true } : { ok: false, message: "Proposal not found or already resolved" };
}

export async function acceptAllPending(
  userId: string,
  sourceId: string,
): Promise<{ accepted: number; skipped: { id: string; reason: string }[] }> {
  const pending = await db.proposal.findMany({
    where: { userId, sourceId, status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  let accepted = 0;
  const skipped: { id: string; reason: string }[] = [];
  for (const p of pending) {
    const result = await acceptProposal(userId, p.id, {
      courseId: await guessCourseId(userId, p),
    });
    if (result.ok) accepted += 1;
    else skipped.push({ id: p.id, reason: result.message });
  }
  return { accepted, skipped };
}

/** Best-effort courseGuess → Course match (name or code, case-insensitive). */
export async function guessCourseId(userId: string, proposal: Proposal): Promise<string | null> {
  const guess = (proposal.payload as ExtractedItemT | null)?.courseGuess?.trim().toLowerCase();
  if (!guess) return null;
  const courses = await db.course.findMany({ where: { userId } });
  return (
    courses.find((c) => {
      const name = c.name.toLowerCase();
      const code = c.code?.toLowerCase();
      return (
        guess.includes(name) ||
        name.includes(guess) ||
        (code ? guess.includes(code) : false)
      );
    })?.id ?? null
  );
}
