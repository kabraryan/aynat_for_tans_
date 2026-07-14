"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/api";
import type { EventCreate, EventUpdate } from "@/lib/schemas";

export type CalEvent = {
  id: string;
  title: string;
  startAt: string; // ISO UTC
  endAt: string; // ISO UTC
  allDay: boolean;
  courseId: string | null;
  location: string | null;
  notes: string | null;
  rrule: string | null;
};

const KEY = ["events"] as const;

export function useEvents() {
  return useQuery({ queryKey: KEY, queryFn: () => apiFetch<CalEvent[]>("/api/events") });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EventCreate) =>
      apiFetch<CalEvent>("/api/events", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: EventUpdate & { id: string }) =>
      apiFetch<CalEvent>(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: true }>(`/api/events/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
