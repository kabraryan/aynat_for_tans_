"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/api";
import type { ProposalRow } from "@/hooks/useProposals";

type AutoAcceptedRow = ProposalRow & { resolvedAt: string | null };

const SEEN_KEY = "aynat.autoAddedSeenAt";
const DEFAULT_WINDOW_MS = 7 * 24 * 3600e3;

/**
 * Surfaces what the auto-accept policy added while the user wasn't looking:
 * "N items added automatically from email", expandable, one-click Undo per
 * item. Dismiss advances a localStorage watermark so each batch is announced
 * once per browser.
 */
export function AutoAddedBanner({ tz }: { tz: string }) {
  const queryClient = useQueryClient();
  // lazy init: localStorage exists client-side only; during SSR the banner
  // renders null anyway (query disabled), so hydration output matches
  const [since, setSince] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : (window.localStorage.getItem(SEEN_KEY) ??
        new Date(Date.now() - DEFAULT_WINDOW_MS).toISOString()),
  );
  const [expanded, setExpanded] = useState(false);

  const { data } = useQuery({
    queryKey: ["auto-accepted", since],
    enabled: !!since,
    queryFn: () =>
      apiFetch<AutoAcceptedRow[]>(
        `/api/proposals?status=ACCEPTED&autoAccepted=true&since=${encodeURIComponent(since!)}`,
      ),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });

  const undo = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/api/proposals/${id}/undo`, { method: "POST" }),
    onSuccess: () => {
      for (const key of ["auto-accepted", "tasks", "events", "proposals", "sources"])
        queryClient.invalidateQueries({ queryKey: [key] });
    },
  });

  if (!data || data.length === 0) return null;

  function dismiss() {
    const now = new Date().toISOString();
    window.localStorage.setItem(SEEN_KEY, now);
    setSince(now); // empties the query → banner unmounts
    setExpanded(false);
  }

  const dateLabel = (row: AutoAcceptedRow) => {
    const iso = row.payload.kind === "event" ? row.payload.startAt : row.payload.dueAt;
    if (!iso) return "no date";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      day: "numeric",
      month: "short",
      ...(row.payload.allDay ? {} : { hour: "2-digit", minute: "2-digit" }),
    }).format(new Date(iso));
  };

  return (
    <div className="mx-4 mt-3 rounded-lg border border-line bg-accent-soft/60 px-4 py-3 sm:mx-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="text-xs font-medium">
          ✨ {data.length} item{data.length === 1 ? "" : "s"} added automatically from email
        </p>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-accent hover:underline"
        >
          {expanded ? "Hide" : "Show"}
        </button>
        <button onClick={dismiss} className="ml-auto text-xs text-ink-faint hover:text-ink">
          Dismiss
        </button>
      </div>
      {expanded && (
        <ul className="mt-2.5 flex flex-col gap-1.5 border-t border-line pt-2.5">
          {data.map((row) => (
            <li key={row.id} className="flex items-center gap-2 text-xs">
              <span className="text-ink-faint">{row.kind === "EVENT" ? "📅" : "☑︎"}</span>
              <span className="min-w-0 flex-1 truncate">{row.payload.title}</span>
              <span className="shrink-0 text-ink-faint">{dateLabel(row)}</span>
              <button
                onClick={() => undo.mutate(row.id)}
                disabled={undo.isPending}
                className="shrink-0 text-accent hover:underline disabled:opacity-50"
              >
                Undo
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
