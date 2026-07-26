import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { extractFromSource } from "@/lib/extraction";
import { autoAcceptConfident } from "@/lib/proposals";
import { matchesSchoolEmail } from "@/lib/gmail/filter";
import { getMessageBody, getMessageMeta, listMessageIds } from "@/lib/gmail/client";
import { INITIAL_LOOKBACK_DAYS } from "@/config/gmail-filters";

export type SyncResult = {
  scanned: number;
  matched: number;
  created: number; // new Sources (deduped by gmailMessageId)
  skipped: number; // failed the pre-filter
};

/**
 * Manual "Sync now" (spec 6.5) — kept a plain function so a cron can call it
 * later. Pre-filter runs BEFORE any model call; matched emails become EMAIL
 * Sources feeding the same review gate. Extraction is kicked off by the
 * caller (route) so this stays fast.
 */
export async function syncGmail(userId: string): Promise<SyncResult & { newSourceIds: string[] }> {
  const state = await db.gmailSyncState.findUnique({ where: { userId } });
  const after =
    state?.lastSyncAt ?? new Date(Date.now() - INITIAL_LOOKBACK_DAYS * 24 * 3600e3);
  const syncStartedAt = new Date();

  const ids = await listMessageIds(userId, after);
  let matched = 0;
  let created = 0;
  const newSourceIds: string[] = [];

  for (const id of ids) {
    // dedupe before any further API calls
    const existing = await db.source.findUnique({
      where: { userId_gmailMessageId: { userId, gmailMessageId: id } },
      select: { id: true },
    });
    if (existing) continue;

    const meta = await getMessageMeta(userId, id);
    if (!matchesSchoolEmail(meta)) continue;
    matched += 1;

    const body = await getMessageBody(userId, id);
    const text = [
      `From: ${meta.from}`,
      `Subject: ${meta.subject}`,
      `Date: ${meta.date}`,
      "",
      body || meta.snippet,
    ].join("\n");

    // body stored via the storage adapter → extraction + cache reuse the
    // same file path as uploads
    const fileKey = await storage.put(Buffer.from(text, "utf8"), {
      originalName: `${id}.txt`,
    });

    const source = await db.source.create({
      data: {
        userId,
        type: "EMAIL",
        gmailMessageId: id,
        fileKey,
        mimeType: "text/plain",
        originalName: meta.subject || "(no subject)",
        excerpt: text.slice(0, 500),
      },
    });
    created += 1;
    newSourceIds.push(source.id);
  }

  await db.gmailSyncState.upsert({
    where: { userId },
    update: { lastSyncAt: syncStartedAt },
    create: { userId, lastSyncAt: syncStartedAt },
  });

  return { scanned: ids.length, matched, created, skipped: ids.length - matched, newSourceIds };
}

/**
 * Sequentially extract the sources a sync created (called via after() by the
 * route, directly by the scheduler). After each extraction the auto-accept
 * policy runs — a no-op unless the user opted in under Settings → Gmail.
 */
export async function extractSources(sourceIds: string[]): Promise<void> {
  for (const id of sourceIds) {
    try {
      await extractFromSource(id);
      const { accepted, considered } = await autoAcceptConfident(id);
      if (considered > 0)
        console.log(`[gmail] source ${id}: auto-accepted ${accepted}/${considered} confident items`);
    } catch (err) {
      console.error(`extraction failed for email source ${id}:`, err);
    }
  }
}
