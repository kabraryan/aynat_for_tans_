import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, requireUserId } from "@/lib/api";
import { acceptAllPending } from "@/lib/proposals";

const schema = z.object({ sourceId: z.string() });

export async function POST(req: Request) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;

  const body = await parseBody(req, schema);
  if ("response" in body) return body.response;

  const result = await acceptAllPending(auth.userId, body.data.sourceId);
  return NextResponse.json(result);
}
