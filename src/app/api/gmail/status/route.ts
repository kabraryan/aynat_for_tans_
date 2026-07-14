import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/api";
import { gmailConnected } from "@/lib/gmail/client";
import { db } from "@/lib/db";

export async function GET() {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;

  const [connected, state] = await Promise.all([
    gmailConnected(auth.userId),
    db.gmailSyncState.findUnique({ where: { userId: auth.userId } }),
  ]);
  return NextResponse.json({
    connected,
    lastSyncAt: state?.lastSyncAt ?? null,
  });
}
