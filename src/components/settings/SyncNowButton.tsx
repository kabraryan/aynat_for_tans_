"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SyncResponse = {
  scanned: number;
  matched: number;
  created: number;
  skipped: number;
  error?: { code: string; message: string };
};

export function SyncNowButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/gmail/sync", { method: "POST" });
      const body = (await res.json()) as SyncResponse;
      if (!res.ok) {
        setMessage(body.error?.message ?? "Sync failed");
        return;
      }
      setMessage(
        body.created > 0
          ? `${body.created} new email${body.created === 1 ? "" : "s"} queued for extraction (${body.skipped} skipped). Check Review shortly.`
          : `Nothing new — ${body.scanned} emails scanned, ${body.skipped} skipped by the filter.`,
      );
      router.refresh();
    } catch {
      setMessage("Sync failed — is the dev server reachable?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={sync}
        disabled={busy}
        className="self-start rounded-md bg-accent px-3.5 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {busy ? "Syncing…" : "Sync now"}
      </button>
      {message && <p className="text-xs text-ink-muted">{message}</p>}
    </div>
  );
}
