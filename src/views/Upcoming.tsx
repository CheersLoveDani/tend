import { AnimatePresence } from "motion/react";
import { useMemo } from "react";
import type { Reminder } from "../lib/api";
import { useStore } from "../lib/store";
import { dayName, plusDays, today } from "../lib/dates";
import { TaskCard } from "../components/TaskCard";
import { Plus } from "../components/Icons";
import { format, parseISO } from "date-fns";

export function Upcoming({ onEdit, onAdd }: { onEdit: (r: Reminder) => void; onAdd: (date: string) => void }) {
  const { snap } = useStore();
  const t = today();

  const days = useMemo(() => {
    const future = (snap?.reminders ?? []).filter((r) => r.date > t && r.status === "open");
    const horizon = Array.from({ length: 14 }, (_, i) => plusDays(i + 1));
    const later = [...new Set(future.map((r) => r.date))].filter((d) => !horizon.includes(d)).sort();
    return [...horizon, ...later].map((d) => ({ date: d, items: future.filter((r) => r.date === d) }));
  }, [snap, t]);

  const count = days.reduce((n, d) => n + d.items.length, 0);

  return (
    <div className="view">
      <header className="view-head">
        <p className="view-kicker">The next two weeks</p>
        <h1>Coming up</h1>
        <p className="view-sub">{count === 0 ? "Nothing planned yet — future you has a clear path." : `${count} planted for later.`}</p>
      </header>
      <div className="timeline">
        {days.map(({ date, items }) => (
          <section key={date} className={`tl-day ${items.length ? "" : "is-empty"}`}>
            <div className="tl-date">
              <span className="tl-name">{dayName(date)}</span>
              <span className="tl-num">{format(parseISO(date), "d MMM")}</span>
            </div>
            <div className="tl-items">
              <AnimatePresence mode="popLayout">
                {items.map((r) => (
                  <TaskCard key={r.id} r={r} onEdit={onEdit} compact />
                ))}
              </AnimatePresence>
              <button className="tl-add" onClick={() => onAdd(date)} aria-label={`Add a reminder for ${dayName(date)}`}>
                <Plus size={14} /> {items.length ? "Add" : "Plan something"}
              </button>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
