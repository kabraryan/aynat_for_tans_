import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notFound, parseBody, requireUserId } from "@/lib/api";
import { eventUpdateSchema } from "@/lib/schemas";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const body = await parseBody(req, eventUpdateSchema);
  if ("response" in body) return body.response;

  const { startAt, endAt, courseId, ...rest } = body.data;
  const { count } = await db.event.updateMany({
    where: { id, userId: auth.userId },
    data: {
      ...rest,
      ...(startAt !== undefined ? { startAt: new Date(startAt) } : {}),
      ...(endAt !== undefined ? { endAt: new Date(endAt) } : {}),
      ...(courseId !== undefined
        ? {
            courseId: courseId
              ? ((await db.course.findFirst({ where: { id: courseId, userId: auth.userId } }))?.id ?? null)
              : null,
          }
        : {}),
    },
  });
  if (count === 0) return notFound();

  const event = await db.event.findUnique({ where: { id } });
  return NextResponse.json(event);
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const { count } = await db.event.deleteMany({ where: { id, userId: auth.userId } });
  if (count === 0) return notFound();
  return NextResponse.json({ ok: true });
}
