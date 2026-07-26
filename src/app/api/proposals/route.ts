import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireUserId } from "@/lib/api";

const STATUSES = new Set(["PENDING", "ACCEPTED", "REJECTED"]);

export async function GET(req: Request) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;

  const params = new URL(req.url).searchParams;
  const status = params.get("status")?.toUpperCase() ?? "PENDING";
  const sourceId = params.get("sourceId");
  if (!STATUSES.has(status)) return jsonError(400, "bad_status", "Unknown status filter");

  // ?autoAccepted=true&since=ISO — the auto-added banner's feed
  const autoAccepted = params.get("autoAccepted") === "true";
  const sinceRaw = params.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : null;
  if (since && Number.isNaN(since.getTime()))
    return jsonError(400, "bad_since", "since must be an ISO datetime");

  const proposals = await db.proposal.findMany({
    where: {
      userId: auth.userId,
      status: status as "PENDING" | "ACCEPTED" | "REJECTED",
      ...(sourceId ? { sourceId } : {}),
      ...(autoAccepted ? { autoAccepted: true } : {}),
      ...(since ? { resolvedAt: { gte: since } } : {}),
    },
    orderBy: autoAccepted ? { resolvedAt: "desc" } : { createdAt: "asc" },
    include: { source: { select: { id: true, originalName: true, type: true, createdAt: true } } },
  });
  return NextResponse.json(proposals);
}
