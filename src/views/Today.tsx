import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import type { Reminder } from "../lib/api";
import { useStore } from "../lib/store";
import { greeting, longDate, today } from "../lib/dates";
import { earned } from "../lib/rewards";
import { TaskCard } from "../components/TaskCard";
import { Seed } from "../components/Icons";

export function Today({ onEdit, onAdd }: { onEdit: (r: Reminder) => void; onAdd: () => void }) {
  const { snap } = useStore();
  const [showDone, setShowDone] = useState(false);
  const t = today();

  const { earlier, todays, done, possible, gathered } = useMemo(() => {
    const all = snap?.reminders ?? [];
    const earlier = all.filter((r) => r.status === "open" && r.date < t);
    const todays = all.filter((r) => r.status === "open" && r.date === t);
    const done = all.filter((r) => r.status === "done" && r.completedAt && new Date(r.completedAt).toDateString() === new Date().toDateString());
    const possible = [...earlier, ...todays].reduce((n, r) => n + r.reward - earned(r), 0);
    const gathered = snap?.days.at(-1)?.seeds ?? 0;
    return { earlier, todays, done, possible, gathered };
  }, [snap, t]);

  const open = earlier.length + todays.length;

  return (
    <div className="view">
      <header className="view-head">
        <p className="view-kicker">{longDate()}</p>
        <h1>{greeting()}</h1>
        <p className="view-sub">
          {open === 0 && done.length === 0 && "Nothing planted for today yet."}
          {open === 0 && done.length > 0 && "Everything for today is done. Rest is part of growing."}
          {open > 0 && (
            <>
              {open === 1 ? "One thing" : `${open} things`} waiting, worth <Seed size={13} /> {possible} seeds.
              {gathered > 0 && ` You've gathered ${gathered} today.`}
            </>
          )}
        </p>
      </header>

      {earlier.length > 0 && (
        <section className="list-section">
          <h2 className="section-title">Still waiting from before</h2>
          <div className="list">
            <AnimatePresence mode="popLayout">
              {earlier.map((r) => (
                <TaskCard key={r.id} r={r} onEdit={onEdit} />
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      <section className="list-section">
        {earlier.length > 0 && <h2 className="section-title">Today</h2>}
        <div className="list">
          <AnimatePresence mode="popLayout">
            {todays.map((r) => (
              <TaskCard key={r.id} r={r} onEdit={onEdit} />
            ))}
          </AnimatePresence>
        </div>
        {todays.length === 0 && (
          <motion.button className="empty" onClick={onAdd} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <span className="empty-title">Plant something for today</span>
            <span className="empty-sub">Small things count. "Drink a glass of water" is a fine start.</span>
          </motion.button>
        )}
      </section>

      {done.length > 0 && (
        <section className="list-section">
          <button className="section-toggle" onClick={() => setShowDone((s) => !s)} aria-expanded={showDone}>
            Done today ({done.length})
          </button>
          <AnimatePresence initial={false}>
            {showDone && (
              <motion.div className="list" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                {done.map((r) => (
                  <TaskCard key={r.id} r={r} onEdit={onEdit} compact />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}
    </div>
  );
}
