"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAcceptAll,
  useProposals,
  useRetryExtraction,
  useSourcePolling,
} from "@/hooks/useProposals";
import { ProposalCard } from "@/components/review/ProposalCard";
import { BatchReviewTable } from "@/components/review/BatchReviewTable";

/** Many-item sources (syllabi) get the table; small ones keep the cards. */
const BATCH_THRESHOLD = 8;

export function SourceReview({ sourceId, tz }: { sourceId: string; tz: string }) {
  const { data: source } = useSourcePolling(sourceId);
  const { data: proposals } = useProposals(sourceId);
  const acceptAll = useAcceptAll();
  const retry = useRetryExtraction();
  const qc = useQueryClient();

  // when extraction finishes, pull in the fresh proposals immediately
  const status = source?.status;
  useEffect(() => {
    if (status === "EXTRACTED") {
      qc.invalidateQueries({ queryKey: ["proposals"] });
    }
  }, [status, qc]);

  if (!source) return <p className="text-xs text-ink-faint">Loading…</p>;

  if (source.status === "PENDING") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-panel p-10 text-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent" />
        <p className="text-sm font-medium">Extracting from {source.originalName ?? "your file"}…</p>
        <p className="text-xs text-ink-muted">Usually 10–30 seconds.</p>
      </div>
    );
  }

  if (source.status === "FAILED") {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger-soft p-6">
        <p className="text-sm font-medium text-danger">Extraction failed</p>
        <p className="text-xs text-ink-muted">{source.error}</p>
        <button
          onClick={() => retry.mutate(sourceId)}
          disabled={retry.isPending}
          className="self-start rounded-md bg-accent px-3.5 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          Retry extraction
        </button>
      </div>
    );
  }

  const pending = proposals ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">
            {source.originalName ?? "Extracted items"}
          </h2>
          <p className="text-xs text-ink-muted">
            {pending.length} proposal{pending.length === 1 ? "" : "s"} to review — nothing is
            saved until you accept it
          </p>
        </div>
        {pending.length > 1 && pending.length <= BATCH_THRESHOLD && (
          <button
            onClick={() => acceptAll.mutate(sourceId)}
            disabled={acceptAll.isPending}
            className="shrink-0 rounded-md border border-accent px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent-soft disabled:opacity-50"
          >
            Accept all
          </button>
        )}
      </div>

      {acceptAll.data && acceptAll.data.skipped.length > 0 && (
        <p className="rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">
          {acceptAll.data.skipped.length} item(s) skipped — they need edits first.
        </p>
      )}

      {pending.length > BATCH_THRESHOLD ? (
        <BatchReviewTable proposals={pending} tz={tz} />
      ) : (
        pending.map((p) => <ProposalCard key={p.id} proposal={p} tz={tz} />)
      )}

      {pending.length === 0 &&
        (source.totalCount === 0 ? (
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-8 text-center">
            <p className="text-sm font-medium">No dated tasks or events found</p>
            <p className="mx-auto max-w-md text-xs text-ink-muted">
              Extraction finished, but this document contains nothing schedulable — no due
              dates, exam dates, or timed sessions. Reference documents (curriculum guides,
              subject briefs, grading policies) typically extract nothing. A course syllabus
              with a dated assessment schedule will.
            </p>
            <button
              onClick={() => retry.mutate(sourceId)}
              disabled={retry.isPending}
              className="mx-auto rounded-md border border-line px-3.5 py-1.5 text-xs font-medium text-ink-muted hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {retry.isPending ? "Retrying…" : "Retry extraction anyway"}
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-panel p-8 text-center">
            <p className="text-sm">All reviewed.</p>
            <p className="mt-1 text-xs text-ink-muted">
              Accepted items are on your{" "}
              <Link href="/todos" className="text-accent hover:underline">
                tasks
              </Link>{" "}
              and{" "}
              <Link href="/calendar" className="text-accent hover:underline">
                calendar
              </Link>
              .
            </p>
          </div>
        ))}
    </div>
  );
}
