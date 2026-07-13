import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notFound, parseBody, requireUserId } from "@/lib/api";
import { taskUpdateSchema } from "@/lib/schemas";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const body = await parseBody(req, taskUpdateSchema);
  if ("response" in body) return body.response;

  const { dueAt, status, courseId, ...rest } = body.data;
  const { count } = await db.task.updateMany({
    where: { id, userId: auth.userId },
    data: {
      ...rest,
      ...(dueAt !== undefined ? { dueAt: dueAt ? new Date(dueAt) : null } : {}),
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
  if (count === 0) return notFound();

  const task = await db.task.findUnique({ where: { id } });
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
