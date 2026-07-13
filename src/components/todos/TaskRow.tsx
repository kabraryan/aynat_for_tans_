"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatDueLabel, fromWallTime } from "@/lib/dates";
import type { Task } from "@/hooks/useTasks";
import type { Course } from "@/hooks/useCourses";
import { useDeleteTask, useUpdateTask } from "@/hooks/useTasks";
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

const PRIORITY_LABEL = { LOW: "Low", MEDIUM: null, HIGH: "High" } as const;

function TaskEditor({
  task,
  courses,
  tz,
  onClose,
}: {
  task: Task;
  courses: Course[];
  tz: string;
  onClose: () => void;
}) {
  const update = useUpdateTask();
  const zonedDue = task.dueAt ? new TZDate(new Date(task.dueAt), tz) : null;
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [courseId, setCourseId] = useState(task.courseId ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [date, setDate] = useState(zonedDue ? format(zonedDue, "yyyy-MM-dd") : "");
  const [time, setTime] = useState(
    zonedDue && !task.allDayDue ? format(zonedDue, "HH:mm") : "",
  );

  return (
    <form
      className="flex flex-col gap-2.5 rounded-lg border border-line bg-panel p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        update.mutate(
          {
            id: task.id,
            title: title.trim(),
            notes: notes.trim() || null,
            courseId: courseId || null,
            priority,
            dueAt: date ? fromWallTime(date, time || null, tz).toISOString() : null,
            allDayDue: Boolean(date) && !time,
          },
          { onSuccess: onClose },
        );
      }}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded-md border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        placeholder="Title"
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        className="resize-none rounded-md border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        placeholder="Notes (optional)"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-line px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          disabled={!date}
          className="rounded-md border border-line px-2 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-40"
        />
        <select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className="rounded-md border border-line bg-panel px-2 py-1.5 text-sm outline-none focus:border-accent"
        >
          <option value="">No course</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Task["priority"])}
          className="rounded-md border border-line bg-panel px-2 py-1.5 text-sm outline-none focus:border-accent"
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onClose} className="px-2 py-1 text-xs text-ink-muted hover:text-ink">
            Cancel
          </button>
          <button
            type="submit"
            disabled={update.isPending}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </form>
  );
}

export function TaskRow({
  task,
  courses,
  tz,
}: {
  task: Task;
  courses: Course[];
  tz: string;
}) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const course = courses.find((c) => c.id === task.courseId);
  const done = task.status === "DONE";

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, disabled: editing });

  if (editing) {
    return (
      <li ref={setNodeRef}>
        <TaskEditor task={task} courses={courses} tz={tz} onClose={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-center gap-2.5 rounded-lg border border-line bg-panel px-3 py-2 ${
        isDragging ? "opacity-60 shadow-md" : ""
      }`}
    >
      <button
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-ink-faint hover:text-ink"
      >
        ⋮⋮
      </button>
      <input
        type="checkbox"
        checked={done}
        onChange={() => update.mutate({ id: task.id, status: done ? "TODO" : "DONE" })}
        className="h-4 w-4 accent-[--color-accent]"
      />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm ${done ? "text-ink-faint line-through" : ""}`}>
          {task.title}
          {PRIORITY_LABEL[task.priority] && (
            <span
              className={`ml-2 rounded px-1 py-0.5 text-[10px] font-medium ${
                task.priority === "HIGH" ? "bg-danger-soft text-danger" : "bg-surface text-ink-faint"
              }`}
            >
              {PRIORITY_LABEL[task.priority]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          {course && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: course.color }} />
              {course.name}
            </span>
          )}
          {task.dueAt && (
            <span>{formatDueLabel(new Date(task.dueAt), task.allDayDue, tz)}</span>
          )}
        </div>
      </div>
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-ink-faint hover:text-ink"
      >
        Edit
      </button>
      <button
        onClick={() => remove.mutate(task.id)}
        className="text-xs text-ink-faint hover:text-danger"
      >
        Delete
      </button>
    </li>
  );
}
