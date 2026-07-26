import { NextResponse } from "next/server";
import { jsonError, requireUserId } from "@/lib/api";
import { undoAutoAccept } from "@/lib/proposals";

type Params = { params: Promise<{ id: string }> };

/**
 * Undo an AUTO-accepted proposal: deletes the task/event it created and puts
 * the proposal back in the review queue. Manual accepts are not undoable
 * here — the user saw those before they were written.
 */
export async function POST(_req: Request, { params }: Params) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const result = await undoAutoAccept(auth.userId, id);
  if (!result.ok) return jsonError(409, "not_undoable", result.message);
  return NextResponse.json({ ok: true });
}
