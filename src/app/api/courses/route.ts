import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseBody, requireUserId } from "@/lib/api";
import { courseCreateSchema } from "@/lib/schemas";

export async function GET() {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;

  const courses = await db.course.findMany({
    where: { userId: auth.userId },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(courses);
}

export async function POST(req: Request) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;

  const body = await parseBody(req, courseCreateSchema);
  if ("response" in body) return body.response;

  const course = await db.course.create({
    data: { ...body.data, userId: auth.userId },
  });
  return NextResponse.json(course, { status: 201 });
}
