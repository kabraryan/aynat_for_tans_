"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { fromWallTime } from "@/lib/dates";
import type { ExtractedItemT } from "@/lib/extraction/schema";
import { useCourses } from "@/hooks/useCourses";
import { useResolveProposal, type ProposalRow } from "@/hooks/useProposals";
import { useQueryClient } from "@tanstack/react-query";

type RowState = {
  selected: boolean;
  title: string;
  date: string; // IST wall date, "" = undated
  time: string; // IST wall time, "" = all-day
};

function initialRow(p: ProposalRow, tz: string): RowState {
  const iso = p.payload.kind === "task" ? p.payload.dueAt : p.payload.startAt;
  const zoned = iso ? new TZDate(new Date(iso), tz) : null;
  return {
    selected: true,
    title: p.payload.title,
    date: zoned ? format(zoned, "yyyy-MM-dd") : "",
    time: zoned && !p.payload.allDay ? format(zoned, "HH:mm") : "",
  };
}

/**
 * Syllabus mode (spec 6.4): table-style review for many-item sources —
 * select all, assign the course once, accept in bulk.
 */
export function BatchReviewTable({
  proposals,
  tz,
}: {
  proposals: ProposalRow[];
  tz: string;
}) {
  const { data: courses } = useCourses();
  const resolve = useResolveProposal();
  const qc = useQueryClient();
  const [bulkCourseId, setBulkCourseId] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Map<string, RowState>>(
    () => new Map(proposals.map((p) => [p.id, initialRow(p, tz)])),
  );

  // rows for proposals that arrived after mount (e.g. refetch)
  const rowFor = (p: ProposalRow): RowState => rows.get(p.id) ?? initialRow(p, tz);
  const patchRow = (id: string, patch: Partial<RowState>, p: ProposalRow) =>
    setRows((m) => new Map(m).set(id, { ...rowFor(p), ...patch }));

  const selectedCount = proposals.filter((p) => rowFor(p).selected).length;
  const allSelected = selectedCount === proposals.length;

  const guessCourse = useMemo(() => {
    return (p: ProposalRow): string => {
      const guess = p.payload.courseGuess?.trim().toLowerCase();
      if (!guess || !courses) return "";
      return (
        courses.find((c) => {
          const name = c.name.toLowerCase();
          const code = c.code?.toLowerCase();
          return (
            guess.includes(name) || name.includes(guess) || (code ? guess.includes(code) : false)
          );
        })?.id ?? ""
      );
    };
  }, [courses]);

  function buildEdits(p: ProposalRow, row: RowState): Partial<ExtractedItemT> {
    const isTask = p.payload.kind === "task";
    const startISO = row.date
      ? fromWallTime(row.date, row.time || null, tz).toISOString()
      : null;
    let endISO: string | null = null;
    if (!isTask && startISO) {
      const origStart = p.payload.startAt ? new Date(p.payload.startAt).getTime() : null;
      const origEnd = p.payload.endAt ? new Date(p.payload.endAt).getTime() : null;
      const duration =
        origStart !== null && origEnd !== null && origEnd > origStart
          ? origEnd - origStart
          : 3600e3;
      endISO = new Date(new Date(startISO).getTime() + duration).toISOString();
    }
    return {
      title: row.title.trim().slice(0, 120),
      allDay: !row.time,
      dueAt: isTask ? startISO : null,
      startAt: isTask ? null : startISO,
      endAt: isTask ? null : endISO,
    };
  }

  async function resolveSelected(action: "accept" | "reject") {
    setBusy(true);
    try {
      for (const p of proposals) {
        const row = rowFor(p);
        if (!row.selected) continue;
        if (action === "accept" && p.payload.kind === "event" && !row.date) continue;
        await resolve.mutateAsync({
          id: p.id,
          action,
          ...(action === "accept"
            ? { edits: buildEdits(p, row), courseId: bulkCourseId || guessCourse(p) || null }
            : {}),
        });
      }
    } finally {
      setBusy(false);
      qc.invalidateQueries();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2">
        <span className="text-xs text-ink-muted">{selectedCount} selected</span>
        <select
          value={bulkCourseId}
          onChange={(e) => setBulkCourseId(e.target.value)}
          className="rounded-md border border-line bg-panel px-2 py-1 text-xs outline-none focus:border-accent"
        >
          <option value="">Course: auto-guess</option>
          {courses?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <button
            disabled={busy || selectedCount === 0}
            onClick={() => resolveSelected("reject")}
            className="rounded-md px-3 py-1.5 text-xs text-ink-muted hover:text-danger disabled:opacity-50"
          >
            Reject selected
          </button>
          <button
            disabled={busy || selectedCount === 0}
            onClick={() => resolveSelected("accept")}
            className="rounded-md bg-accent px-3.5 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "Working…" : `Accept selected (${selectedCount})`}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-muted">
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) =>
                    setRows(
                      new Map(
                        proposals.map((p) => [
                          p.id,
                          { ...rowFor(p), selected: e.target.checked },
                        ]),
                      ),
                    )
                  }
                />
              </th>
              <th className="px-2 py-2 font-medium">Kind</th>
              <th className="px-2 py-2 font-medium">Title</th>
              <th className="px-2 py-2 font-medium">Date</th>
              <th className="px-2 py-2 font-medium">Time</th>
              <th className="px-2 py-2 font-medium">Conf.</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map((p) => {
              const row = rowFor(p);
              const low = p.confidence < 0.7;
              return (
                <tr key={p.id} className={`border-b border-line last:border-0 ${low ? "bg-warn-soft/40" : ""}`}>
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={(e) => patchRow(p.id, { selected: e.target.checked }, p)}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                    {p.payload.kind}
                  </td>
                  <td className="w-full px-2 py-1.5">
                    <input
                      value={row.title}
                      onChange={(e) => patchRow(p.id, { title: e.target.value }, p)}
                      title={p.payload.sourceQuote}
                      className="w-full min-w-48 rounded border border-transparent px-1.5 py-1 text-sm outline-none hover:border-line focus:border-accent"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="date"
                      value={row.date}
                      onChange={(e) => patchRow(p.id, { date: e.target.value }, p)}
                      className="rounded border border-line px-1.5 py-1 text-xs outline-none focus:border-accent"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="time"
                      value={row.time}
                      onChange={(e) => patchRow(p.id, { time: e.target.value }, p)}
                      className="rounded border border-line px-1.5 py-1 text-xs outline-none focus:border-accent"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-xs text-ink-faint">
                    {low && (
                      <span className="mr-1 rounded-full bg-warn-soft px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                        check
                      </span>
                    )}
                    {(p.confidence * 100).toFixed(0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-faint">
        Hover a title to see the verbatim source quote. Empty time = all-day. Events keep
        their original duration when you change the start.
      </p>
    </div>
  );
}
