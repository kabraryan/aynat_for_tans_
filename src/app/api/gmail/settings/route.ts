import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, requireUserId } from "@/lib/api";
import { db } from "@/lib/db";

const patchSchema = z.object({
  autoSync: z.boolean().optional(),
  autoAccept: z.boolean().optional(),
});

/** Toggle background sync / auto-accept (Settings → Gmail). */
export async function PATCH(req: Request) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;

  const body = await parseBody(req, patchSchema);
  if ("response" in body) return body.response;

  const state = await db.gmailSyncState.upsert({
    where: { userId: auth.userId },
    update: body.data,
    create: { userId: auth.userId, ...body.data },
  });
  return NextResponse.json({
    autoSync: state.autoSync,
    autoAccept: state.autoAccept,
  });
}
