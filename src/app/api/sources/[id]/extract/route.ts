import { NextResponse } from "next/server";
import { after } from "next/server";
import { db } from "@/lib/db";
import { notFound, requireUserId } from "@/lib/api";
import { extractFromSource } from "@/lib/extraction";

type Params = { params: Promise<{ id: string }> };

/** Re-run extraction: replaces this source's PENDING proposals only. */
export async function POST(_req: Request, { params }: Params) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const { count } = await db.source.updateMany({
    where: { id, userId: auth.userId },
    data: { status: "PENDING", error: null },
  });
  if (count === 0) return notFound();

  after(async () => {
    try {
      await extractFromSource(id);
    } catch (err) {
      console.error(`re-extraction failed for source ${id}:`, err);
    }
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
