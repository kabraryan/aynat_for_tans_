import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseBody, requireUserId } from "@/lib/api";
import { eventCreateSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;

  const params = new URL(req.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const events = await db.event.findMany({
    where: {
      userId: auth.userId,
      ...(from ? { endAt: { gte: new Date(from) } } : {}),
      ...(to ? { startAt: { lte: new Date(to) } } : {}),
    },
    orderBy: { startAt: "asc" },
  });
  return NextResponse.json(events);
}

export async function POST(req: Request) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;

  const body = await parseBody(req, eventCreateSchema);
  if ("response" in body) return body.response;

  const { startAt, endAt, courseId, ...rest } = body.data;
  const event = await db.event.create({
    data: {
      ...rest,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      ...(courseId
        ? { courseId: (await db.course.findFirst({ where: { id: courseId, userId: auth.userId } }))?.id ?? null }
        : { courseId: null }),
      userId: auth.userId,
    },
  });
  return NextResponse.json(event, { status: 201 });
}
