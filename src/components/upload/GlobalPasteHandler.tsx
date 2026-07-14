"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadFile } from "@/hooks/useProposals";

/**
 * Paste-from-clipboard works anywhere in the app (spec 6.3): a pasted image
 * uploads immediately and routes to the review screen.
 */
export function GlobalPasteHandler() {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      // don't hijack pastes into text fields
      if (target?.closest("input, textarea, [contenteditable=true]")) return;

      const item = [...(e.clipboardData?.items ?? [])].find((i) =>
        i.type.startsWith("image/"),
      );
      if (!item) return;
      const file = item.getAsFile();
      if (!file) return;

      e.preventDefault();
      setToast("Uploading…");
      try {
        const source = await uploadFile(
          new File([file], file.name || "pasted-image.png", { type: file.type }),
        );
        setToast(null);
        router.push(`/review/${source.id}`);
      } catch (err) {
        setToast(err instanceof Error ? err.message : "Upload failed");
        setTimeout(() => setToast(null), 4000);
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [router]);

  if (!toast) return null;
  return (
    <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-4 py-2 text-xs font-medium text-white shadow-lg sm:bottom-6">
      {toast}
    </div>
  );
}
