"use client";

import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import { uploadFile } from "@/hooks/useProposals";

export function DropZone() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/webp": [".webp"],
      "application/pdf": [".pdf"],
    },
    maxSize: 15 * 1024 * 1024,
    multiple: false,
    onDropAccepted: async ([file]) => {
      setBusy(true);
      setError(null);
      try {
        const source = await uploadFile(file);
        router.push(`/review/${source.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    onDropRejected: (rejections) =>
      setError(rejections[0]?.errors[0]?.message ?? "File rejected"),
  });

  return (
    <div>
      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          isDragActive
            ? "border-accent bg-accent-soft"
            : "border-line-strong bg-panel hover:border-accent"
        }`}
      >
        <input {...getInputProps()} />
        <p className="text-sm font-medium">
          {busy ? "Uploading…" : "Drop a screenshot, photo, or PDF"}
        </p>
        <p className="text-xs text-ink-muted">
          or click to browse · or paste an image anywhere (⌘V) · up to 15 MB
        </p>
      </div>
      {error && (
        <p className="mt-2 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
