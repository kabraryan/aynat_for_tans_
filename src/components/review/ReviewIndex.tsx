"use client";

import Link from "next/link";
import { useProposals } from "@/hooks/useProposals";
import { ProposalCard } from "@/components/review/ProposalCard";
import { DropZone } from "@/components/upload/DropZone";

export function ReviewIndex({ tz }: { tz: string }) {
  const { data: proposals, isLoading } = useProposals();

  const bySource = new Map<string, NonNullable<typeof proposals>>();
  for (const p of proposals ?? []) {
    const list = bySource.get(p.sourceId) ?? [];
    list.push(p);
    bySource.set(p.sourceId, list);
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <DropZone />

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
