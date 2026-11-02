import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import type { Reminder } from "../lib/api";
import { useStore } from "../lib/store";
import { greeting, longDate, today } from "../lib/dates";
import { earned } from "../lib/rewards";
import { TaskCard } from "../components/TaskCard";
import { DoseCard } from "../components/DoseCard";
import { WeatherCheckIn } from "../components/WeatherCheckIn";
import { todaysWeather } from "../lib/weather";
import { Seed } from "../components/Icons";

export function Today({ onEdit, onAdd, onOpenMed }: { onEdit: (r: Reminder) => void; onAdd: () => void; onOpenMed: (id: string) => void }) {
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
  // Medicine first: due doses, then the rest of today's. Taken ones live on the Medicine tab.
  const doses = (snap?.doses ?? []).filter((d) => d.status === "due" || d.status === "upcoming");
  const dueDoses = doses.filter((d) => d.status === "due").length;

  return (
    <div className="view">
      <header className="view-head">
        <p className="view-kicker">{longDate()}</p>
        <h1>{greeting()}</h1>
        <p className="view-sub">
          {dueDoses > 0 && <>{dueDoses === 1 ? "A dose is due. " : `${dueDoses} doses are due. `}</>}
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

      {doses.length > 0 && (
        <section className="list-section">
          <h2 className="section-title">Medicine</h2>
          <div className="list">
            <AnimatePresence mode="popLayout">
              {doses.map((d) => (
                <DoseCard key={d.id} d={d} onOpen={onOpenMed} />
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      {snap && todaysWeather(snap.entries) === null && (
        <section className="list-section">
          <h2 className="section-title">What's the weather like in you today?</h2>
          <WeatherCheckIn compact />
        </section>
      )}

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
        {(earlier.length > 0 || doses.length > 0) && <h2 className="section-title">Today</h2>}
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
