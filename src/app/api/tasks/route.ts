import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseBody, requireUserId } from "@/lib/api";
import { taskCreateSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;

  const courseId = new URL(req.url).searchParams.get("courseId");
  const tasks = await db.task.findMany({
    where: { userId: auth.userId, ...(courseId ? { courseId } : {}) },
    orderBy: [{ sortOrder: "asc" }, { dueAt: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(tasks);
}

export async function POST(req: Request) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;

  const body = await parseBody(req, taskCreateSchema);
  if ("response" in body) return body.response;

  const { dueAt, courseId, repeatUntil, ...rest } = body.data;
  const task = await db.task.create({
    data: {
      ...rest,
      dueAt: dueAt ? new Date(dueAt) : null,
      repeatUntil: repeatUntil ? new Date(repeatUntil) : null,
      // scope the FK to this user; silently dropping a foreign courseId
      ...(courseId
        ? { courseId: (await db.course.findFirst({ where: { id: courseId, userId: auth.userId } }))?.id ?? null }
        : { courseId: null }),
      userId: auth.userId,
    },
  });
  return NextResponse.json(task, { status: 201 });
}
