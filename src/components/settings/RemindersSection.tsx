"use client";

import { useEffect, useState } from "react";
import { remindersEnabled, setRemindersEnabled } from "@/components/reminders/ReminderWatcher";

export function RemindersSection() {
  const [state, setState] = useState<"loading" | "unsupported" | "off" | "denied" | "on">(
    "loading",
  );

  useEffect(() => {
    // deferred: Notification/localStorage only exist client-side
    const timer = setTimeout(() => {
      if (!("Notification" in window)) setState("unsupported");
      else if (Notification.permission === "denied") setState("denied");
      else setState(remindersEnabled() ? "on" : "off");
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function enable() {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return setState("denied");
    setRemindersEnabled(true);
    setState("on");
    new Notification("Reminders on", {
      body: "You'll hear about tasks the evening before and events an hour ahead — while the app is open.",
    });
  }

  function disable() {
    setRemindersEnabled(false);
    setState("off");
  }

  return (
    <section className="w-full max-w-xl">
      <h2 className="text-sm font-semibold">Reminders</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Browser notifications while the app is open: timed tasks 24 h ahead, all-day tasks
        the evening before (18:00), events 60 min ahead.
      </p>
      <div className="mt-3 rounded-lg border border-line bg-panel p-4">
        {state === "loading" && <p className="text-xs text-ink-faint">…</p>}
        {state === "unsupported" && (
          <p className="text-xs text-ink-muted">This browser doesn&apos;t support notifications.</p>
        )}
        {state === "denied" && (
          <p className="text-xs text-ink-muted">
            Notifications are blocked for this site — allow them in your browser&apos;s site
            settings, then reload.
          </p>
        )}
        {state === "off" && (
          <button
            onClick={enable}
            className="rounded-md bg-accent px-3.5 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
          >
            Enable reminders
          </button>
        )}
        {state === "on" && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-ok">✓ Reminders on</p>
            <button onClick={disable} className="text-xs text-ink-muted hover:text-ink">
              Turn off
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
