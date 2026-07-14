"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/api";
import type { ExtractedItemT } from "@/lib/extraction/schema";

export type ProposalRow = {
  id: string;
  sourceId: string;
  kind: "TASK" | "EVENT";
  payload: ExtractedItemT;
  confidence: number;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  createdAt: string;
  source: { id: string; originalName: string | null; type: "UPLOAD" | "EMAIL"; createdAt: string };
};

export type SourceStatus = {
  id: string;
  type: "UPLOAD" | "EMAIL";
  originalName: string | null;
  status: "PENDING" | "EXTRACTED" | "FAILED";
  error: string | null;
  pendingCount: number;
};

const PROPOSALS_KEY = ["proposals"] as const;

export function useProposals(sourceId?: string) {
  return useQuery({
    queryKey: [...PROPOSALS_KEY, sourceId ?? "all"],
    queryFn: () =>
      apiFetch<ProposalRow[]>(
        `/api/proposals?status=pending${sourceId ? `&sourceId=${sourceId}` : ""}`,
      ),
  });
}

/** Poll a source while extraction runs (plan: polling over SSE). */
export function useSourcePolling(sourceId: string | null) {
  return useQuery({
    queryKey: ["source", sourceId],
    queryFn: () => apiFetch<SourceStatus>(`/api/sources/${sourceId}`),
    enabled: Boolean(sourceId),
    refetchInterval: (query) =>
      query.state.data?.status === "PENDING" ? 1500 : false,
  });
}

export function useResolveProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      action: "accept" | "reject";
      edits?: Partial<ExtractedItemT>;
      courseId?: string | null;
    }) =>
      apiFetch(`/api/proposals/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROPOSALS_KEY });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useAcceptAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) =>
      apiFetch<{ accepted: number; skipped: { id: string; reason: string }[] }>(
        "/api/proposals/accept-all",
        { method: "POST", body: JSON.stringify({ sourceId }) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROPOSALS_KEY });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });
}

export function useRetryExtraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) =>
      apiFetch(`/api/sources/${sourceId}/extract`, { method: "POST" }),
    onSuccess: (_d, sourceId) => {
      qc.invalidateQueries({ queryKey: ["source", sourceId] });
      qc.invalidateQueries({ queryKey: PROPOSALS_KEY });
    },
  });
}

export async function uploadFile(file: File): Promise<{ id: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Upload failed (${res.status})`);
  }
  return res.json();
}
