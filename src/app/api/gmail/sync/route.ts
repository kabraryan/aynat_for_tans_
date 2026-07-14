import { NextResponse } from "next/server";
import { after } from "next/server";
import { jsonError, requireUserId } from "@/lib/api";
import { GmailAuthError } from "@/lib/gmail/client";
import { extractSources, syncGmail } from "@/lib/gmail/sync";

/** Manual "Sync now" (spec 6.5). Cron can call syncGmail directly later. */
export async function POST() {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;

  try {
    const result = await syncGmail(auth.userId);
    // extraction runs after the response; the review screen polls per source
    if (result.newSourceIds.length > 0) {
      const ids = result.newSourceIds;
      after(() => extractSources(ids));
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GmailAuthError) {
      return jsonError(409, "gmail_not_connected", err.message);
    }
    throw err;
  }
}
