"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import { dueGroup, type DueGroup } from "@/lib/dates";
import { describeParsed, parseQuickAdd } from "@/lib/quickadd";
import { useCourses, type Course } from "@/hooks/useCourses";
import { useCreateTask, useReorderTasks, useTasks, TASKS_KEY, type Task } from "@/hooks/useTasks";
import { TaskRow } from "@/components/todos/TaskRow";

const GROUPS: { key: DueGroup; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "thisWeek", label: "This week" },
  { key: "later", label: "Later" },
  { key: "none", label: "No date" },
];

function QuickAdd({ tz, courses }: { tz: string; courses: Course[] }) {
  const create = useCreateTask();
  const [input, setInput] = useState("");

  const parsed = useMemo(
    () =>
      input.trim()
        ? parseQuickAdd(input, { now: new Date(), tz, courses })
        : null,
    [input, tz, courses],
  );
  const chips = parsed ? describeParsed(parsed, tz) : [];
  const course = parsed?.courseId ? courses.find((c) => c.id === parsed.courseId) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!parsed?.title) return;
          create.mutate({
            title: parsed.title,
            dueAt: parsed.dueAt,
            allDayDue: parsed.allDayDue,
            priority: parsed.priority,
            courseId: parsed.courseId,
            repeat: "NONE",
          });
          setInput("");
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add a task…  try: ps4 friday 5pm #cs201 !high"
          className="w-full flex-1 rounded-lg border border-line bg-panel px-3 py-2.5 text-sm outline-none placeholder:text-ink-faint focus:border-accent"
        />
        <button
          type="submit"
          disabled={!parsed?.title || create.isPending}
          className="rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40"
        >
          Add
        </button>
      </form>
      {parsed && (chips.length > 0 || course) && (
        <div className="flex items-center gap-1.5 px-1">
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent"
            >
              {chip}
            </span>
          ))}
          {course && (
            <span
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `${course.color}20`, color: course.color }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: course.color }} />
              {course.name}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function TodoList({ tz }: { tz: string }) {
  const { data: tasks, isLoading } = useTasks();
  const { data: courses } = useCourses();
  const reorder = useReorderTasks();
  const qc = useQueryClient();
  const [courseFilter, setCourseFilter] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const grouped = useMemo(() => {
    const now = new Date();
    const filtered = (tasks ?? []).filter(
      (t) => !courseFilter || t.courseId === courseFilter,
    );
    const map = new Map<DueGroup, Task[]>(GROUPS.map((g) => [g.key, []]));
    for (const t of filtered) {
      map.get(dueGroup(t.dueAt ? new Date(t.dueAt) : null, now, tz))!.push(t);
    }
    // Open tasks first (drag order), completed sink to the bottom of the group.
    for (const list of map.values()) {
      list.sort((a, b) =>
        a.status === b.status ? 0 : a.status === "DONE" ? 1 : -1,
      );
    }
    return map;
  }, [tasks, courseFilter, tz]);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    for (const [, list] of grouped) {
      const openIds = list.filter((t) => t.status === "TODO").map((t) => t.id);
      const from = openIds.indexOf(String(active.id));
      const to = openIds.indexOf(String(over.id));
      if (from !== -1 && to !== -1) {
        const nextIds = arrayMove(openIds, from, to);
        // optimistic: rewrite sortOrder locally in the cached list
        qc.setQueryData<Task[]>(TASKS_KEY, (all) =>
          all?.map((t) => {
            const idx = nextIds.indexOf(t.id);
            return idx === -1 ? t : { ...t, sortOrder: idx };
          }),
        );
        reorder.mutate(nextIds);
        return;
      }
    }
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-5">
      <QuickAdd tz={tz} courses={courses ?? []} />

      <div className="flex items-center gap-2">
        <select
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          className="rounded-md border border-line bg-panel px-2 py-1.5 text-xs outline-none focus:border-accent"
        >
          <option value="">All courses</option>
          {courses?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-xs text-ink-faint">Loading…</p>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        {GROUPS.map(({ key, label }) => {
          const list = grouped.get(key) ?? [];
          if (list.length === 0) return null;
          const sortedIds = list.filter((t) => t.status === "TODO").map((t) => t.id);
          return (
            <section key={key}>
              <h2
                className={`mb-2 text-xs font-semibold uppercase tracking-wide ${
                  key === "overdue" ? "text-danger" : "text-ink-muted"
                }`}
              >
                {label}
                <span className="ml-1.5 font-normal text-ink-faint">{list.length}</span>
              </h2>
              <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
                <ul className="flex flex-col gap-1.5">
                  {list.map((task) => (
                    <TaskRow key={task.id} task={task} courses={courses ?? []} tz={tz} />
                  ))}
                </ul>
              </SortableContext>
            </section>
          );
        })}
      </DndContext>

      {tasks?.length === 0 && (
        <p className="text-sm text-ink-faint">Nothing yet — add your first task above.</p>
      )}
    </div>
  );
}
