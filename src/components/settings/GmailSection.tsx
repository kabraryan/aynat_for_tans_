import { signIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { gmailConnected, GMAIL_SCOPE } from "@/lib/gmail/client";
import { SyncNowButton } from "@/components/settings/SyncNowButton";
import { SCHOOL_DOMAINS } from "@/config/gmail-filters";

export async function GmailSection({ userId }: { userId: string }) {
  const [connected, state] = await Promise.all([
    gmailConnected(userId),
    db.gmailSyncState.findUnique({ where: { userId } }),
  ]);

  return (
    <section className="w-full max-w-xl">
      <h2 className="text-sm font-semibold">Gmail sync</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Read-only. Only school-related email (from {SCHOOL_DOMAINS[0]}, your LMS, or with
        deadline keywords) is considered — and nothing is saved without your review.
      </p>

      <div className="mt-3 flex flex-col gap-3 rounded-lg border border-line bg-panel p-4">
        {connected ? (
          <>
            <p className="text-xs text-ok">
              ✓ Connected
              {state?.lastSyncAt && (
                <span className="ml-2 text-ink-faint">
                  last synced {new Date(state.lastSyncAt).toLocaleString()}
                </span>
              )}
            </p>
            <SyncNowButton />
          </>
        ) : (
          <>
            <p className="text-xs text-ink-muted">
              Not connected. Granting access opens Google&apos;s consent screen — the app
              requests <code className="text-[10px]">gmail.readonly</code> only.
            </p>
            <form
              action={async () => {
                "use server";
                await signIn(
                  "google",
                  { redirectTo: "/settings" },
                  {
                    scope: `openid email profile ${GMAIL_SCOPE}`,
                    access_type: "offline",
                    prompt: "consent",
                  },
                );
              }}
            >
              <button
                type="submit"
                className="rounded-md bg-accent px-3.5 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
              >
                Connect Gmail
              </button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
