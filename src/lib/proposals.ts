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
  opts: { edits?: Partial<ExtractedItemT>; courseId?: string | null } = {},
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
      data: { status: "ACCEPTED", resolvedAt: new Date() },
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
    return { ok: true as const, kind: "event" as const, event };
  });
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
