"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/hooks/api";

type Settings = { autoSync: boolean; autoAccept: boolean };

export function GmailAutoToggles({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: keyof Settings) {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next); // optimistic
    setError(null);
    try {
      await apiFetch<Settings>("/api/gmail/settings", {
        method: "PATCH",
        body: JSON.stringify({ [key]: next[key] }),
      });
      router.refresh();
    } catch (err) {
      setSettings(settings); // roll back
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  const rows: { key: keyof Settings; label: string; detail: string }[] = [
    {
      key: "autoSync",
      label: "Auto-sync every 30 minutes",
      detail: "While the app's server is running, new school email is fetched and extracted automatically.",
    },
    {
      key: "autoAccept",
      label: "Auto-add confident items",
      detail:
        "Extractions with ≥90% confidence go straight onto your calendar/tasks — tagged, listed in a banner, and one-click undoable. Everything less confident still waits in Review.",
    },
  ];

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      {rows.map((row) => (
        <label key={row.key} className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={settings[row.key]}
            onChange={() => toggle(row.key)}
            className="mt-0.5 h-3.5 w-3.5 accent-accent"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-xs font-medium">{row.label}</span>
            <span className="text-[11px] leading-relaxed text-ink-faint">{row.detail}</span>
          </span>
        </label>
      ))}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
