import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { isSomeday, type Reminder } from "../lib/api";
import { useStore } from "../lib/store";
import { dayName, plusDays, today, tomorrow } from "../lib/dates";
import { TaskCard } from "../components/TaskCard";
import { Plus, Sun } from "../components/Icons";
import { CalendarList, dayStart, eventsOn, useCalendarEvents } from "../components/CalendarEvents";
import { format, parseISO } from "date-fns";

/** How far ahead calendar events are shown alongside planned days. */
const EVENT_DAYS = 14;

export function Upcoming({ onEdit, onAdd }: { onEdit: (r: Reminder) => void; onAdd: (date: string) => void }) {
  const store = useStore();
  const { snap } = store;
  const t = today();
  const [showSomeday, setShowSomeday] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const from = useMemo(() => dayStart(plusDays(1)), [t]);
  const events = useCalendarEvents(from, from + EVENT_DAYS * 86_400_000);

  const { days, someday } = useMemo(() => {
    const all = snap?.reminders ?? [];
    const future = all.filter((r) => r.date > t && r.status === "open" && !isSomeday(r));
    const someday = all.filter((r) => r.status === "open" && isSomeday(r)).sort((a, b) => b.updatedAt - a.updatedAt);
    // Only days with something on them: no rows of empty days to scroll past.
    const dates = new Set(future.map((r) => r.date));
    for (let i = 1; i <= EVENT_DAYS; i++) {
      const d = plusDays(i);
      if (events && eventsOn(events, d).length) dates.add(d);
    }
    const days = [...dates].sort().map((d) => ({ date: d, items: future.filter((r) => r.date === d), events: events ? eventsOn(events, d) : [] }));
    return { days, someday };
  }, [snap, t, events]);

  const count = days.reduce((n, d) => n + d.items.length, 0);

  const planAnother = () => {
    // The date picker opens straight away where it can; otherwise the editor has its own day picker.
    try {
      picker.current?.showPicker();
    } catch {
      onAdd(tomorrow());
    }
  };

  return (
    <div className="view">
      <header className="view-head">
        <p className="view-kicker">What's planned</p>
        <h1>Coming up</h1>
        <p className="view-sub">{count === 0 ? "Nothing planned yet. Future you has a clear path." : `${count} planted for later.`}</p>
      </header>
      <div className="timeline">
        {days.map(({ date, items, events: evs }) => (
          <section key={date} className="tl-day">
            <div className="tl-date">
              <span className="tl-name">{dayName(date)}</span>
              <span className="tl-num">{format(parseISO(date), "d MMM")}</span>
            </div>
            <div className="tl-items">
              {evs.length > 0 && <CalendarList events={evs} date={date} />}
              <AnimatePresence mode="popLayout">
                {items.map((r) => (
                  <TaskCard key={r.id} r={r} onEdit={onEdit} compact />
                ))}
              </AnimatePresence>
              <button className="tl-add" onClick={() => onAdd(date)} aria-label={`Add a reminder for ${dayName(date)}`}>
                <Plus size={14} /> Add
              </button>
            </div>
          </section>
        ))}
      </div>

      <div className="plan-another">
        <button className="btn btn-soft" onClick={planAnother}>
          <Plus size={16} /> Plan for another day
        </button>
        <input
          ref={picker}
          type="date"
          className="plan-picker"
          min={tomorrow()}
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const d = e.target.value;
            e.target.value = "";
            if (d) onAdd(d);
          }}
        />
      </div>

      {someday.length > 0 && (
        <section className="list-section someday">
          <button className="section-toggle" onClick={() => setShowSomeday((s) => !s)} aria-expanded={showSomeday}>
            Someday ({someday.length})
          </button>
          <p className="hint">No day and no reminders. They'll keep here until you want them.</p>
          <AnimatePresence initial={false}>
            {showSomeday && (
              <motion.ul
                className="someday-list"
                initial={store.reduceMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={store.reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
              >
                {someday.map((r) => (
                  <li key={r.id} className="someday-item">
                    <button className="someday-title" onClick={() => onEdit(r)}>
                      {r.title}
                    </button>
                    <button className="btn btn-soft btn-small" onClick={() => void store.moveTo(r, t)}>
                      <Sun size={14} /> Bring to today
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </section>
      )}
    </div>
  );
}
