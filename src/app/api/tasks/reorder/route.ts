import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, parseBody, requireUserId } from "@/lib/api";
import { taskReorderSchema } from "@/lib/schemas";

/** Persist a drag-reorder: ids arrive in display order for one group. */
export async function POST(req: Request) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;

  const body = await parseBody(req, taskReorderSchema);
  if ("response" in body) return body.response;

  const { ids } = body.data;
  const owned = await db.task.findMany({
    where: { id: { in: ids }, userId: auth.userId },
    select: { id: true },
  });
  if (owned.length !== ids.length) {
    return jsonError(400, "unknown_ids", "Some task ids do not exist");
  }

  await db.$transaction(
    ids.map((id, index) =>
      db.task.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );
  return NextResponse.json({ ok: true });
}
