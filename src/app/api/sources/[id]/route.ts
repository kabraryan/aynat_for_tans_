import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notFound, requireUserId } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/** Polled by the review screen while extraction runs. */
export async function GET(_req: Request, { params }: Params) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const source = await db.source.findFirst({
    where: { id, userId: auth.userId },
    include: { _count: { select: { proposals: { where: { status: "PENDING" } } } } },
  });
  if (!source) return notFound();

  // distinguishes "nothing extractable found" from "all reviewed"
  const totalCount = await db.proposal.count({ where: { sourceId: source.id } });

  return NextResponse.json({
    id: source.id,
    type: source.type,
    originalName: source.originalName,
    status: source.status,
    error: source.error,
    createdAt: source.createdAt,
    pendingCount: source._count.proposals,
    totalCount,
  });
}
