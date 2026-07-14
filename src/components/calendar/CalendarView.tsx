"use client";

import { useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import rrulePlugin from "@fullcalendar/rrule";
import type { EventDropArg } from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import { format } from "date-fns";
import { fromWallTime, toWallString, userDayKey } from "@/lib/dates";
import { useCourses } from "@/hooks/useCourses";
import { useEvents, useUpdateEvent } from "@/hooks/useEvents";
import { useTasks } from "@/hooks/useTasks";
import { EventDialog, type DialogState } from "@/components/calendar/EventDialog";

/**
 * All datetimes handed to FullCalendar are naive wall-clock strings already
 * converted to the user's timezone (toWallString); everything coming back out
 * is re-anchored with fromWallTime. FullCalendar itself runs in "local" mode
 * and never sees a UTC instant, so no timezone plugin is needed.
 */
export function CalendarView({
  tz,
  initialDate,
}: {
  tz: string;
  /** Deep link (e.g. from the workload view): open this week directly. */
  initialDate?: string;
}) {
  const { data: events } = useEvents();
  const { data: tasks } = useTasks();
  const { data: courses } = useCourses();
  const updateEvent = useUpdateEvent();
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });
  // Phones get the agenda list by default; drag targets are too small there.
  const [initialView] = useState(() =>
    initialDate
      ? "timeGridWeek"
      : typeof window !== "undefined" && window.innerWidth < 640
        ? "listWeek"
        : "dayGridMonth",
  );

  const calendarEvents = useMemo(() => {
    const courseColor = (courseId: string | null) =>
      courses?.find((c) => c.id === courseId)?.color;

    const evs = (events ?? []).map((e) => {
      const base = {
        id: e.id,
        title: e.title,
        allDay: e.allDay,
        backgroundColor: courseColor(e.courseId) ?? "#4f46e5",
        borderColor: "transparent",
        extendedProps: { kind: "event" as const },
      };
      if (e.rrule) {
        // recurring series: rrule plugin expands occurrences; edit via dialog
        const durationMs = Math.max(
          new Date(e.endAt).getTime() - new Date(e.startAt).getTime(),
          60_000,
        );
        return {
          ...base,
          rrule: `DTSTART:${toWallString(new Date(e.startAt), tz).replace(/[-:]/g, "")}\nRRULE:${e.rrule}`,
          duration: e.allDay ? undefined : msToDuration(durationMs),
          editable: false,
        };
      }
      return {
        ...base,
        start: e.allDay ? userDayKey(new Date(e.startAt), tz) : toWallString(new Date(e.startAt), tz),
        end: e.allDay ? undefined : toWallString(new Date(e.endAt), tz),
      };
    });

    // Open tasks with due dates render as visually-distinct all-day chips.
    const chips = (tasks ?? [])
      .filter((t) => t.dueAt && t.status === "TODO")
      .map((t) => ({
        id: `task-${t.id}`,
        title: t.title,
        start: userDayKey(new Date(t.dueAt!), tz),
        allDay: true,
        editable: false,
        backgroundColor: "transparent",
        borderColor: courseColor(t.courseId) ?? "#a8a29e",
        textColor: "#1c1917",
        classNames: ["task-chip"],
        extendedProps: { kind: "task" as const },
      }));

    return [...evs, ...chips];
  }, [events, tasks, courses, tz]);

  /** "HH:mm" duration for FullCalendar's rrule events. */
  function msToDuration(ms: number): string {
    const totalMinutes = Math.round(ms / 60000);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  /** Re-anchor a dragged/resized event's local wall clock into the user tz. */
  function persistMove(arg: EventDropArg | EventResizeDoneArg) {
    const { event } = arg;
    if (!event.start) return arg.revert();
    const startAt = fromWallTime(
      format(event.start, "yyyy-MM-dd"),
      event.allDay ? null : format(event.start, "HH:mm"),
      tz,
    );
    const endBase = event.end ?? event.start;
    const endAt = event.allDay
      ? fromWallTime(format(event.start, "yyyy-MM-dd"), "23:59", tz)
      : fromWallTime(format(endBase, "yyyy-MM-dd"), format(endBase, "HH:mm"), tz);
    updateEvent.mutate(
      { id: event.id, startAt: startAt.toISOString(), endAt: endAt.toISOString(), allDay: event.allDay },
      { onError: () => arg.revert() },
    );
  }

  return (
    <div className="flex-1 [&_.fc]:h-full [&_.task-chip]:border-l-2 [&_.task-chip_.fc-event-title]:font-medium">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, rrulePlugin]}
        initialView={initialView}
        initialDate={initialDate}
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
        }}
        height="auto"
        now={() => toWallString(new Date(), tz)}
        nowIndicator
        weekNumbers={false}
        firstDay={1}
        selectable
        editable
        dayMaxEventRows={4}
        // Month: clicking a day drills into its agenda (spec 6.1)
        navLinks
        dateClick={(info) => {
          if (info.view.type === "dayGridMonth") {
            info.view.calendar.changeView("timeGridDay", info.dateStr);
          } else {
            // clicking an empty slot in week/day view creates an event there
            setDialog({
              mode: "create",
              date: format(info.date, "yyyy-MM-dd"),
              startTime: info.allDay ? null : format(info.date, "HH:mm"),
              endTime: info.allDay ? null : format(new Date(info.date.getTime() + 3600e3), "HH:mm"),
            });
          }
        }}
        select={(info) => {
          if (info.view.type === "dayGridMonth") return;
          setDialog({
            mode: "create",
            date: format(info.start, "yyyy-MM-dd"),
            startTime: info.allDay ? null : format(info.start, "HH:mm"),
            endTime: info.allDay ? null : format(info.end, "HH:mm"),
          });
        }}
        eventClick={(info) => {
          if (info.event.extendedProps.kind !== "event") return;
          const source = events?.find((e) => e.id === info.event.id);
          if (source) setDialog({ mode: "edit", event: source });
        }}
        eventDrop={persistMove}
        eventResize={persistMove}
        events={calendarEvents}
      />
      {dialog.mode !== "closed" && (
        <EventDialog
          state={dialog}
          courses={courses ?? []}
          tz={tz}
          onClose={() => setDialog({ mode: "closed" })}
        />
      )}
      <button
        onClick={() =>
          setDialog({
            mode: "create",
            date: userDayKey(new Date(), tz),
            startTime: "09:00",
            endTime: "10:00",
          })
        }
        className="fixed bottom-6 right-6 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-lg hover:bg-accent-hover"
      >
        + Event
      </button>
    </div>
  );
}
