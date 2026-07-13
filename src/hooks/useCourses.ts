"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/api";
import type { CourseCreate, CourseUpdate } from "@/lib/schemas";

export type Course = {
  id: string;
  name: string;
  code: string | null;
  color: string;
  term: string | null;
};

const KEY = ["courses"] as const;

export function useCourses() {
  return useQuery({ queryKey: KEY, queryFn: () => apiFetch<Course[]>("/api/courses") });
}

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CourseCreate) =>
      apiFetch<Course>("/api/courses", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: CourseUpdate & { id: string }) =>
      apiFetch<Course>(`/api/courses/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: true }>(`/api/courses/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
