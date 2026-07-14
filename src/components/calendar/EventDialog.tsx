"use client";

import { useState } from "react";
import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { fromWallTime } from "@/lib/dates";
import type { Course } from "@/hooks/useCourses";
import {
  useCreateEvent,
  useDeleteEvent,
  useUpdateEvent,
  type CalEvent,
} from "@/hooks/useEvents";

export type DialogState =
  | { mode: "closed" }
  | { mode: "create"; date: string; startTime: string | null; endTime: string | null }
  | { mode: "edit"; event: CalEvent };

export function EventDialog({
  state,
  courses,
  tz,
  onClose,
}: {
  state: Exclude<DialogState, { mode: "closed" }>;
  courses: Course[];
  tz: string;
  onClose: () => void;
}) {
  const create = useCreateEvent();
  const update = useUpdateEvent();
  const remove = useDeleteEvent();

  const editing = state.mode === "edit" ? state.event : null;
  const zonedStart = editing ? new TZDate(new Date(editing.startAt), tz) : null;
  const zonedEnd = editing ? new TZDate(new Date(editing.endAt), tz) : null;

  const [title, setTitle] = useState(editing?.title ?? "");
  const [date, setDate] = useState(
    editing && zonedStart ? format(zonedStart, "yyyy-MM-dd") : state.mode === "create" ? state.date : "",
  );
  const [allDay, setAllDay] = useState(
    editing ? editing.allDay : state.mode === "create" && !state.startTime,
  );
  const [startTime, setStartTime] = useState(
    editing && zonedStart && !editing.allDay
      ? format(zonedStart, "HH:mm")
      : state.mode === "create"
        ? (state.startTime ?? "09:00")
        : "09:00",
  );
  const [endTime, setEndTime] = useState(
    editing && zonedEnd && !editing.allDay
      ? format(zonedEnd, "HH:mm")
      : state.mode === "create"
        ? (state.endTime ?? "10:00")
        : "10:00",
  );
  const [courseId, setCourseId] = useState(editing?.courseId ?? "");
  const [location, setLocation] = useState(editing?.location ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  // limited recurrence subset: FREQ[;INTERVAL=2][;UNTIL=YYYYMMDD]
  const existingRrule = editing?.rrule ?? "";
  const [repeat, setRepeat] = useState(
    /FREQ=WEEKLY;INTERVAL=2/.test(existingRrule)
      ? "BIWEEKLY"
      : /FREQ=WEEKLY/.test(existingRrule)
        ? "WEEKLY"
        : /FREQ=MONTHLY/.test(existingRrule)
          ? "MONTHLY"
          : "NONE",
  );
  const [repeatUntil, setRepeatUntil] = useState(
    existingRrule.match(/UNTIL=(\d{4})(\d{2})(\d{2})/)?.slice(1).join("-") ?? "",
  );

  const busy = create.isPending || update.isPending || remove.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) return;
    const startAt = fromWallTime(date, allDay ? null : startTime, tz).toISOString();
    const endAt = allDay
      ? fromWallTime(date, "23:59", tz).toISOString()
      : fromWallTime(date, endTime >= startTime ? endTime : startTime, tz).toISOString();
    const rrule =
      repeat === "NONE"
        ? null
        : [
            repeat === "MONTHLY" ? "FREQ=MONTHLY" : "FREQ=WEEKLY",
            repeat === "BIWEEKLY" ? "INTERVAL=2" : null,
            repeatUntil ? `UNTIL=${repeatUntil.replaceAll("-", "")}` : null,
          ]
            .filter(Boolean)
            .join(";");
    const payload = {
      title: title.trim(),
      startAt,
      endAt,
      allDay,
      courseId: courseId || null,
      location: location.trim() || null,
      notes: notes.trim() || null,
      rrule,
    };
    if (editing) update.mutate({ id: editing.id, ...payload }, { onSuccess: onClose });
    else create.mutate(payload, { onSuccess: onClose });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="flex w-full max-w-md flex-col gap-3 rounded-xl border border-line bg-panel p-5 shadow-lg"
      >
        <h2 className="text-sm font-semibold">
          {editing ? "Edit event" : "New event"}
        </h2>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="rounded-md border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-line px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            All day
          </label>
          {!allDay && (
            <>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="rounded-md border border-line px-2 py-1.5 text-sm outline-none focus:border-accent"
              />
              <span className="text-xs text-ink-faint">to</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="rounded-md border border-line px-2 py-1.5 text-sm outline-none focus:border-accent"
              />
            </>
          )}
        </div>
        <div className="flex gap-2">
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="flex-1 rounded-md border border-line bg-panel px-2 py-1.5 text-sm outline-none focus:border-accent"
          >
            <option value="">No course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location (opt.)"
            className="flex-1 rounded-md border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            className="rounded-md border border-line bg-panel px-2 py-1.5 text-sm outline-none focus:border-accent"
          >
            <option value="NONE">No repeat</option>
            <option value="WEEKLY">Weekly</option>
            <option value="BIWEEKLY">Biweekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
          {repeat !== "NONE" && (
            <>
              <span className="text-xs text-ink-faint">until</span>
              <input
                type="date"
                value={repeatUntil}
                onChange={(e) => setRepeatUntil(e.target.value)}
                className="rounded-md border border-line px-2 py-1.5 text-sm outline-none focus:border-accent"
              />
            </>
          )}
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Notes (optional)"
          className="resize-none rounded-md border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
        <div className="mt-1 flex items-center justify-between">
          {editing ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => remove.mutate(editing.id, { onSuccess: onClose })}
              className="text-xs text-danger hover:underline disabled:opacity-50"
            >
              Delete event
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !title.trim() || !date}
              className="rounded-md bg-accent px-3.5 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {editing ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
