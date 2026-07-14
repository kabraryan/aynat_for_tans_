"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { fromWallTime } from "@/lib/dates";
import type { ExtractedItemT } from "@/lib/extraction/schema";
import { useCourses } from "@/hooks/useCourses";
import { useResolveProposal, type ProposalRow } from "@/hooks/useProposals";

function wall(dateISO: string | null, tz: string): { date: string; time: string } {
  if (!dateISO) return { date: "", time: "" };
  const z = new TZDate(new Date(dateISO), tz);
  return { date: format(z, "yyyy-MM-dd"), time: format(z, "HH:mm") };
}

export function ProposalCard({ proposal, tz }: { proposal: ProposalRow; tz: string }) {
  const { data: courses } = useCourses();
  const resolve = useResolveProposal();
  const p = proposal.payload;

  const [title, setTitle] = useState(p.title);
  const [kind, setKind] = useState(p.kind);
  const [allDay, setAllDay] = useState(p.allDay);
  const startWall = wall(p.kind === "task" ? p.dueAt : p.startAt, tz);
  const endWall = wall(p.endAt, tz);
  const [date, setDate] = useState(startWall.date);
  const [startTime, setStartTime] = useState(p.allDay ? "" : startWall.time);
  const [endTime, setEndTime] = useState(p.allDay ? "" : endWall.time);
  const [priority, setPriority] = useState(p.priority);

  // prefill course from the model's guess (name or code match)
  const guessedCourseId = useMemo(() => {
    const guess = p.courseGuess?.trim().toLowerCase();
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
  }, [courses, p.courseGuess]);
  const [courseId, setCourseId] = useState<string>(guessedCourseId);
  // keep prefill when courses load after first render
  const effectiveCourseId = courseId || guessedCourseId;

  const lowConfidence = proposal.confidence < 0.7;
  const busy = resolve.isPending;

  function buildEdits(): Partial<ExtractedItemT> {
    const isTask = kind === "task";
    const startISO = date
      ? fromWallTime(date, allDay || !startTime ? null : startTime, tz).toISOString()
      : null;
    const endISO =
      !isTask && date
        ? fromWallTime(
            date,
            allDay || !endTime ? "23:59" : endTime,
            tz,
          ).toISOString()
        : null;
    return {
      title: title.trim().slice(0, 120),
      kind,
      allDay: allDay || (isTask && !startTime),
      dueAt: isTask ? startISO : null,
      startAt: isTask ? null : startISO,
      endAt: isTask ? null : endISO,
      priority,
    };
  }

  return (
    <div
      className={`flex flex-col gap-2.5 rounded-xl border bg-panel p-4 ${
        lowConfidence ? "border-warn/40" : "border-line"
      }`}
    >
      <div className="flex items-center gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "task" | "event")}
          className="rounded-md border border-line bg-panel px-1.5 py-1 text-xs font-medium uppercase tracking-wide text-ink-muted outline-none"
        >
          <option value="task">Task</option>
          <option value="event">Event</option>
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-transparent px-1.5 py-1 text-sm font-medium outline-none hover:border-line focus:border-accent"
        />
        {lowConfidence && (
          <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[10px] font-semibold text-warn">
            check this
          </span>
        )}
        <span className="shrink-0 text-[10px] text-ink-faint" title="Model confidence">
          {(proposal.confidence * 100).toFixed(0)}%
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-line px-2 py-1 text-xs outline-none focus:border-accent"
        />
        <label className="flex items-center gap-1 text-xs text-ink-muted">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          all day
        </label>
        {!allDay && (
          <>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-md border border-line px-2 py-1 text-xs outline-none focus:border-accent"
            />
            {kind === "event" && (
              <>
                <span className="text-xs text-ink-faint">to</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="rounded-md border border-line px-2 py-1 text-xs outline-none focus:border-accent"
                />
              </>
            )}
          </>
        )}
        <select
          value={effectiveCourseId}
          onChange={(e) => setCourseId(e.target.value)}
          className="rounded-md border border-line bg-panel px-2 py-1 text-xs outline-none focus:border-accent"
        >
          <option value="">No course</option>
          {courses?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {kind === "task" && (
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
            className="rounded-md border border-line bg-panel px-2 py-1 text-xs outline-none focus:border-accent"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        )}
        {p.courseGuess && !effectiveCourseId && (
          <span className="text-xs text-ink-faint">model guessed “{p.courseGuess}”</span>
        )}
      </div>

      <blockquote className="border-l-2 border-line-strong pl-2.5 text-xs italic text-ink-muted">
        “{p.sourceQuote}”
      </blockquote>

      <div className="flex justify-end gap-2">
        <button
          disabled={busy}
          onClick={() => resolve.mutate({ id: proposal.id, action: "reject" })}
          className="rounded-md px-3 py-1.5 text-xs text-ink-muted hover:text-danger disabled:opacity-50"
        >
          Reject
        </button>
        <button
          disabled={busy || !title.trim() || (kind === "event" && !date)}
          onClick={() =>
            resolve.mutate({
              id: proposal.id,
              action: "accept",
              edits: buildEdits(),
              courseId: effectiveCourseId || null,
            })
          }
          className="rounded-md bg-accent px-3.5 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          Accept
        </button>
      </div>
      {resolve.isError && (
        <p className="text-xs text-danger">{(resolve.error as Error).message}</p>
      )}
    </div>
  );
}
