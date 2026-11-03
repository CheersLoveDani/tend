import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { calendar, type CalendarEvent } from "../lib/calendar";
import { useStore } from "../lib/store";
import { clock } from "../lib/dates";

const hm = (ms: number) => clock(format(ms, "HH:mm"));

/** Local midnight at the start of a "yyyy-MM-dd" day, as epoch ms. */
export const dayStart = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
};

/**
 * Read-only events from the phone's calendars over [from, to), or null when the calendar isn't
 * switched on in Settings, isn't allowed, or this device can't read one (Windows).
 */
export function useCalendarEvents(from: number, to: number): CalendarEvent[] | null {
  const { settings } = useStore();
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const enabled = settings.calendarEnabled;
  const ids = settings.calendarIds;
  const idKey = ids.join(",");

  useEffect(() => {
    if (!enabled) return setEvents(null);
    let alive = true;
    const load = async () => {
      try {
        // The browser preview (?cal) fakes a granted calendar.
        const granted = "__TEND_MOCK_CAL__" in window || (await calendar.status()).status === "granted";
        const found = granted ? await calendar.events(from, to, ids) : null;
        if (alive) setEvents(found);
      } catch (e) {
        console.warn("calendar", e);
        if (alive) setEvents(null);
      }
    };
    void load();
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    const every = window.setInterval(load, 10 * 60_000);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(every);
    };
  }, [enabled, idKey, from, to]);

  return events;
}

/** The events touching one day: all-day ones first, then by start time. */
export function eventsOn(events: CalendarEvent[], date: string): CalendarEvent[] {
  const from = dayStart(date);
  const to = from + 86_400_000;
  return events
    .filter((e) => e.start < to && e.end > from)
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start || a.title.localeCompare(b.title));
}

function when(e: CalendarEvent, date: string) {
  if (e.allDay) return "All day";
  const from = dayStart(date);
  const to = from + 86_400_000;
  if (e.start < from && e.end > to) return "All day";
  if (e.start < from) return `until ${hm(e.end)}`;
  return hm(e.start);
}

/** A compact, look-only list: tap an event to see when it ends and where it is. */
export function CalendarList({ events, date }: { events: CalendarEvent[]; date: string }) {
  const { reduceMotion } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="cal-list">
      {events.map((e) => {
        const isOpen = open === e.id;
        const end = !e.allDay && e.end > e.start ? `${hm(e.start)} – ${hm(e.end)}` : "";
        return (
          <li key={e.id + e.start}>
            <button className="cal-event" onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen}>
              <span className="cal-dot" style={{ background: e.color || "var(--dusk)" }} aria-hidden />
              <span className="cal-time">{when(e, date)}</span>
              <span className="cal-title">{e.title || "Busy"}</span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (end || e.location) && (
                <motion.p
                  className="cal-more"
                  initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
                >
                  {end}
                  {end && e.location && " · "}
                  {e.location}
                </motion.p>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}
