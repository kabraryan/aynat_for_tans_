import { db } from "@/lib/db";
import { GmailAuthError } from "@/lib/gmail/client";
import { extractSources, syncGmail } from "@/lib/gmail/sync";

/**
 * Background Gmail sync: while the server runs, every user who opted in
 * (Settings → Gmail → auto-sync) gets the same syncGmail → extract →
 * auto-accept pipeline as "Sync now", every 30 minutes. Started once from
 * instrumentation.ts; the globalThis guard survives dev HMR the same way the
 * Prisma singleton does.
 */
const SYNC_INTERVAL_MS = 30 * 60_000;
const FIRST_TICK_DELAY_MS = 20_000; // let the server settle before the boot pass

const g = globalThis as unknown as { aynatGmailSyncTimer?: ReturnType<typeof setInterval> };
let running = false;

export function startGmailAutoSync(): void {
  if (g.aynatGmailSyncTimer) return;
  g.aynatGmailSyncTimer = setInterval(() => void tick(), SYNC_INTERVAL_MS);
  setTimeout(() => void tick(), FIRST_TICK_DELAY_MS);
  console.log("[gmail] auto-sync scheduler started (every 30 min)");
}

async function tick(): Promise<void> {
  if (running) return; // a slow sync must never overlap the next tick
  running = true;
  try {
    const states = await db.gmailSyncState.findMany({ where: { autoSync: true } });
    for (const state of states) {
      try {
        const result = await syncGmail(state.userId);
        await extractSources(result.newSourceIds);
        await db.gmailSyncState.update({
          where: { userId: state.userId },
          data: { lastAutoSyncAt: new Date(), lastSyncError: null },
        });
        if (result.created > 0)
          console.log(`[gmail] auto-sync: ${result.created} new email(s) for ${state.userId}`);
      } catch (err) {
        // an expired token (Testing-mode OAuth) pauses sync until the user
        // reconnects — record it so Settings can say so instead of failing silently
        const message =
          err instanceof GmailAuthError
            ? "Gmail access expired — reconnect under Settings to resume auto-sync"
            : err instanceof Error
              ? err.message
              : String(err);
        await db.gmailSyncState
          .update({
            where: { userId: state.userId },
            data: { lastAutoSyncAt: new Date(), lastSyncError: message },
          })
          .catch(() => {});
        console.error(`[gmail] auto-sync failed for ${state.userId}: ${message}`);
      }
    }
  } catch (err) {
    console.error("[gmail] auto-sync tick failed:", err);
  } finally {
    running = false;
  }
}
