import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notFound, parseBody, requireUserId } from "@/lib/api";
import { courseUpdateSchema } from "@/lib/schemas";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const body = await parseBody(req, courseUpdateSchema);
  if ("response" in body) return body.response;

  const { count } = await db.course.updateMany({
    where: { id, userId: auth.userId },
    data: body.data,
  });
  if (count === 0) return notFound();

  const course = await db.course.findUnique({ where: { id } });
  return NextResponse.json(course);
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const { count } = await db.course.deleteMany({
    where: { id, userId: auth.userId },
  });
  if (count === 0) return notFound();

  return NextResponse.json({ ok: true });
}
