import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, notFound, parseBody, requireUserId } from "@/lib/api";
import { acceptProposal, rejectProposal } from "@/lib/proposals";
import { ExtractedItem } from "@/lib/extraction/schema";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  action: z.enum(["accept", "reject"]),
  edits: ExtractedItem.partial().optional(),
  courseId: z.string().nullish(),
});

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const body = await parseBody(req, patchSchema);
  if ("response" in body) return body.response;

  if (body.data.action === "reject") {
    const result = await rejectProposal(auth.userId, id);
    if (!result.ok) return notFound();
    return NextResponse.json({ ok: true });
  }

  const result = await acceptProposal(auth.userId, id, {
    edits: body.data.edits,
    courseId: body.data.courseId ?? null,
  });
  if (!result.ok) {
    if (result.code === "not_found") return notFound();
    if (result.code === "already_resolved") return jsonError(409, result.code, result.message);
    return jsonError(400, result.code, result.message);
  }
  return NextResponse.json(result);
}
