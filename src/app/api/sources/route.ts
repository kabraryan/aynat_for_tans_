import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/api";

/** Recent captures for the review index — includes empty/failed ones. */
export async function GET() {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;

  const sources = await db.source.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      _count: { select: { proposals: true } },
    },
  });
  const pendingCounts = await db.proposal.groupBy({
    by: ["sourceId"],
    where: { userId: auth.userId, status: "PENDING" },
    _count: true,
  });
  const pendingBySource = new Map(pendingCounts.map((g) => [g.sourceId, g._count]));

  return NextResponse.json(
    sources.map((s) => ({
      id: s.id,
      type: s.type,
      originalName: s.originalName,
      status: s.status,
      error: s.error,
      createdAt: s.createdAt,
      totalCount: s._count.proposals,
      pendingCount: pendingBySource.get(s.id) ?? 0,
    })),
  );
}
