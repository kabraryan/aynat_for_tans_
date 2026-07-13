"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/api";
import type { TaskCreate, TaskUpdate } from "@/lib/schemas";

export type Task = {
  id: string;
  title: string;
  notes: string | null;
  courseId: string | null;
  dueAt: string | null; // ISO UTC
  allDayDue: boolean;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "TODO" | "DONE";
  sortOrder: number;
  createdAt: string;
  completedAt: string | null;
};

const KEY = ["tasks"] as const;

export function useTasks() {
  return useQuery({ queryKey: KEY, queryFn: () => apiFetch<Task[]>("/api/tasks") });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskCreate) =>
      apiFetch<Task>("/api/tasks", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: TaskUpdate & { id: string }) =>
      apiFetch<Task>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    // Optimistic status toggle so strikethrough is instant.
    onMutate: async ({ id, status }) => {
      if (status === undefined) return;
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<Task[]>(KEY);
      qc.setQueryData<Task[]>(KEY, (tasks) =>
        tasks?.map((t) =>
          t.id === id
            ? { ...t, status, completedAt: status === "DONE" ? new Date().toISOString() : null }
            : t,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(KEY, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: true }>(`/api/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReorderTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch<{ ok: true }>("/api/tasks/reorder", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export { KEY as TASKS_KEY };
