import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notFound, parseBody, requireUserId } from "@/lib/api";
import { taskUpdateSchema } from "@/lib/schemas";
import { nextOccurrence, type RepeatFreq } from "@/lib/recurrence";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const body = await parseBody(req, taskUpdateSchema);
  if ("response" in body) return body.response;

  const { dueAt, status, courseId, repeatUntil, ...rest } = body.data;
  const before = await db.task.findFirst({ where: { id, userId: auth.userId } });
  if (!before) return notFound();

  const task = await db.task.update({
    where: { id },
    data: {
      ...rest,
      ...(dueAt !== undefined ? { dueAt: dueAt ? new Date(dueAt) : null } : {}),
      ...(repeatUntil !== undefined
        ? { repeatUntil: repeatUntil ? new Date(repeatUntil) : null }
        : {}),
      ...(courseId !== undefined
        ? {
            courseId: courseId
              ? ((await db.course.findFirst({ where: { id: courseId, userId: auth.userId } }))?.id ?? null)
              : null,
          }
        : {}),
      // status drives completedAt server-side (spec 6.2)
      ...(status !== undefined
        ? { status, completedAt: status === "DONE" ? new Date() : null }
        : {}),
    },
  });

  // Completing a repeating task spawns its next occurrence (Phase 5.2).
  if (
    status === "DONE" &&
    before.status !== "DONE" &&
    task.repeat !== "NONE" &&
    task.dueAt
  ) {
    const user = await db.user.findUnique({
      where: { id: auth.userId },
      select: { timezone: true },
    });
    const next = nextOccurrence(task.dueAt, task.repeat as RepeatFreq, user?.timezone ?? "Asia/Kolkata");
    if (!task.repeatUntil || next <= task.repeatUntil) {
      await db.task.create({
        data: {
          userId: task.userId,
          courseId: task.courseId,
          title: task.title,
          notes: task.notes,
          dueAt: next,
          allDayDue: task.allDayDue,
          priority: task.priority,
          repeat: task.repeat,
          repeatUntil: task.repeatUntil,
          sourceId: task.sourceId, // provenance carries through the chain
        },
      });
    }
  }

  return NextResponse.json(task);
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const { count } = await db.task.deleteMany({ where: { id, userId: auth.userId } });
  if (count === 0) return notFound();
  return NextResponse.json({ ok: true });
}
