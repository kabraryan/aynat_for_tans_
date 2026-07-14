"use client";

import Link from "next/link";
import { useProposals, useRecentSources, type SourceStatus } from "@/hooks/useProposals";
import { ProposalCard } from "@/components/review/ProposalCard";
import { DropZone } from "@/components/upload/DropZone";

function statusChip(s: SourceStatus) {
  if (s.status === "PENDING")
    return <span className="text-xs text-accent">extracting…</span>;
  if (s.status === "FAILED")
    return <span className="text-xs text-danger">failed</span>;
  if (s.pendingCount > 0)
    return (
      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
        {s.pendingCount} to review
      </span>
    );
  if (s.totalCount === 0)
    return <span className="text-xs text-ink-faint">nothing found</span>;
  return <span className="text-xs text-ok">done</span>;
}

export function ReviewIndex({ tz }: { tz: string }) {
  const { data: proposals, isLoading } = useProposals();
  const { data: sources } = useRecentSources();

  const bySource = new Map<string, NonNullable<typeof proposals>>();
  for (const p of proposals ?? []) {
    const list = bySource.get(p.sourceId) ?? [];
    list.push(p);
    bySource.set(p.sourceId, list);
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <DropZone />

      {sources && sources.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Recent captures
          </h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
            {sources.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/review/${s.id}`}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-surface"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {s.originalName ?? "Email"}
                    <span className="ml-2 text-xs text-ink-faint">
                      {new Date(s.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </span>
                  {statusChip(s)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isLoading && <p className="text-xs text-ink-faint">Loading…</p>}

      {[...bySource.entries()].map(([sourceId, list]) => (
        <section key={sourceId} className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {list[0].source.originalName ?? "Email"}
            </h2>
            <Link
              href={`/review/${sourceId}`}
              className="text-xs text-accent hover:underline"
            >
              open →
            </Link>
          </div>
          {list.map((p) => (
            <ProposalCard key={p.id} proposal={p} tz={tz} />
          ))}
        </section>
      ))}

      {proposals?.length === 0 && (
        <p className="text-sm text-ink-faint">
          Nothing to review. Drop a screenshot or syllabus above — extracted items land here
          for your approval before touching the calendar.
        </p>
      )}
    </div>
  );
}
