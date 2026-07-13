"use client";

import { useState } from "react";
import {
  useCourses,
  useCreateCourse,
  useDeleteCourse,
  useUpdateCourse,
  type Course,
} from "@/hooks/useCourses";
import { COURSE_COLORS, DEFAULT_COURSE_COLOR } from "@/lib/colors";

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {COURSE_COLORS.map((c) => (
        <button
          key={c.hex}
          type="button"
          title={c.name}
          onClick={() => onChange(c.hex)}
          className={`h-5 w-5 rounded-full transition-transform ${
            value === c.hex ? "scale-110 ring-2 ring-ink ring-offset-1" : ""
          }`}
          style={{ backgroundColor: c.hex }}
        />
      ))}
    </div>
  );
}

function CourseForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
  busy,
}: {
  initial?: Course;
  onSubmit: (data: { name: string; code: string | null; color: string; term: string | null }) => void;
  onCancel?: () => void;
  submitLabel: string;
  busy: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [term, setTerm] = useState(initial?.term ?? "");
  const [color, setColor] = useState(initial?.color ?? DEFAULT_COURSE_COLOR);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSubmit({
          name: name.trim(),
          code: code.trim() || null,
          color,
          term: term.trim() || null,
        });
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Course name"
          className="min-w-40 flex-1 rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Code (opt.)"
          className="w-28 rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Term (opt.)"
          className="w-32 rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <ColorPicker value={color} onChange={setColor} />
        <div className="flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-3 py-1.5 text-sm text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

export function CourseManager() {
  const { data: courses, isLoading, error } = useCourses();
  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse();
  const deleteCourse = useDeleteCourse();
  const [editingId, setEditingId] = useState<string | null>(null);
  // Bumped on successful create to remount (and thus clear) the create form.
  const [formEpoch, setFormEpoch] = useState(0);

  return (
    <section className="w-full max-w-xl">
      <h2 className="text-sm font-semibold">Courses</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Tasks and events are color-coded by course.
      </p>

      {error && (
        <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
          {error.message}
        </p>
      )}

      <ul className="mt-4 flex flex-col gap-2">
        {isLoading && <li className="text-xs text-ink-faint">Loading…</li>}
        {courses?.map((course) =>
          editingId === course.id ? (
            <li key={course.id} className="rounded-lg border border-line bg-panel p-3">
              <CourseForm
                initial={course}
                busy={updateCourse.isPending}
                submitLabel="Save"
                onCancel={() => setEditingId(null)}
                onSubmit={(data) =>
                  updateCourse.mutate(
                    { id: course.id, ...data },
                    { onSuccess: () => setEditingId(null) },
                  )
                }
              />
            </li>
          ) : (
            <li
              key={course.id}
              className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2.5"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: course.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {course.name}
                  {course.code && (
                    <span className="ml-2 font-normal text-ink-muted">{course.code}</span>
                  )}
                </div>
                {course.term && <div className="text-xs text-ink-faint">{course.term}</div>}
              </div>
              <button
                onClick={() => setEditingId(course.id)}
                className="text-xs text-ink-muted hover:text-ink"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete "${course.name}"? Its tasks/events keep no course.`))
                    deleteCourse.mutate(course.id);
                }}
                className="text-xs text-ink-muted hover:text-danger"
              >
                Delete
              </button>
            </li>
          ),
        )}
        {courses?.length === 0 && (
          <li className="text-xs text-ink-faint">No courses yet — add your first below.</li>
        )}
      </ul>

      <div className="mt-4 rounded-lg border border-dashed border-line-strong p-3">
        <CourseForm
          key={formEpoch}
          busy={createCourse.isPending}
          submitLabel="Add course"
          onSubmit={(data) =>
            createCourse.mutate(data, { onSuccess: () => setFormEpoch((n) => n + 1) })
          }
        />
      </div>
    </section>
  );
}
