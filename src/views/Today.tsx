import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { SOMEDAY, type Reminder } from "../lib/api";
import { useStore } from "../lib/store";
import { greeting, longDate, today } from "../lib/dates";
import { earned } from "../lib/rewards";
import { isPaused } from "../lib/settings";
import { TaskCard } from "../components/TaskCard";
import { DoseCard } from "../components/DoseCard";
import { WeatherCheckIn } from "../components/WeatherCheckIn";
import { pickQuote, todaysWeather, weatherOf, type Quote, type Weather } from "../lib/weather";
import { Close, Moon, Seed } from "../components/Icons";
import { GoalBars } from "../components/GoalBars";
import { CalendarList, dayStart, eventsOn, useCalendarEvents } from "../components/CalendarEvents";

export function Today({ onEdit, onAdd, onOpenMed }: { onEdit: (r: Reminder) => void; onAdd: () => void; onOpenMed: (id: string) => void }) {
  const store = useStore();
  const { snap, settings } = store;
  const [showDone, setShowDone] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);
  // The check-in's answer shows right here; it no longer whisks you off to the Garden.
  const [reaction, setReaction] = useState<{ key: number; weather: Weather; quote: Quote } | null>(null);
  const t = today();
  const from = useMemo(() => dayStart(t), [t]);
  const events = useCalendarEvents(from, from + 86_400_000);
  const todaysEvents = events ? eventsOn(events, t) : [];

  const { earlier, todays, done, possible, gathered } = useMemo(() => {
    const all = snap?.reminders ?? [];
    // Someday's date sorts after everything, so it never counts as earlier or today.
    const earlier = all.filter((r) => r.status === "open" && r.date < t);
    const todays = all.filter((r) => r.status === "open" && r.date === t);
    const done = all.filter((r) => r.status === "done" && r.completedAt && new Date(r.completedAt).toDateString() === new Date().toDateString());
    const possible = todays.reduce((n, r) => n + r.reward - earned(r), 0);
    const gathered = snap?.days.at(-1)?.seeds ?? 0;
    return { earlier, todays, done, possible, gathered };
  }, [snap, t]);

  useEffect(() => {
    if (!reaction) return;
    const timer = window.setTimeout(() => setReaction(null), 15_000);
    return () => window.clearTimeout(timer);
  }, [reaction?.key]);

  const open = todays.length;
  // Medicine first: due doses, then the rest of today's. Taken ones live on the Medicine tab.
  const doses = (snap?.doses ?? []).filter((d) => d.status === "due" || d.status === "upcoming");
  const dueDoses = doses.filter((d) => d.status === "due").length;
  const paused = isPaused(settings);
  const n = earlier.length;

  return (
    <div className="view">
      <header className="view-head">
        <p className="view-kicker">{longDate()}</p>
        <h1>{greeting()}</h1>
        <p className="view-sub">
          {dueDoses > 0 && <>{dueDoses === 1 ? "A dose is ready. " : `${dueDoses} doses are ready. `}</>}
          {open === 0 && done.length === 0 && "Nothing planted for today yet."}
          {open === 0 && done.length > 0 && "Everything for today is done. Rest is part of growing."}
          {open > 0 && (
            <>
              {open === 1 ? "One thing" : `${open} things`} for today, worth <Seed size={13} /> {possible} seeds.
              {gathered > 0 && ` You've gathered ${gathered} today.`}
            </>
          )}
        </p>
      </header>

      <AnimatePresence initial={false}>
        {paused && (
          <motion.div
            className="paused-banner"
            role="status"
            initial={store.reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={store.reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, height: 0 }}
          >
            <Moon size={16} />
            <span>Quiet for today. No chimes or unlock screen until tomorrow; medicine still reminds you.</span>
            <button className="link" onClick={store.resumeNudges}>
              Turn back on
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <GoalBars />

      {/* LowStockLine goes here (track S) */}

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

      {snap && (todaysWeather(snap.entries) === null || reaction) && (
        <section className="list-section">
          <h2 className="section-title">What's the weather like in you today?</h2>
          <WeatherCheckIn compact onPicked={(w) => setReaction({ key: Date.now(), weather: w, quote: pickQuote(w) })} />
          <AnimatePresence>
            {reaction && (
              <motion.div
                key={reaction.key}
                className={`weather-reaction wq-${reaction.weather}`}
                role="status"
                initial={store.reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <p className="weather-reaction-line">
                  <span aria-hidden>{weatherOf(reaction.weather)?.icon}</span> {weatherOf(reaction.weather)?.line}
                </p>
                <blockquote>“{reaction.quote.text}”</blockquote>
                <p className="weather-reaction-by">{reaction.quote.by}</p>
                <button className="btn btn-quiet btn-icon weather-reaction-close" onClick={() => setReaction(null)} aria-label="Close">
                  <Close size={16} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {todaysEvents.length > 0 && (
        <section className="list-section">
          <h2 className="section-title">On your calendar</h2>
          <CalendarList events={todaysEvents} date={t} />
        </section>
      )}

      <section className="list-section">
        {(n > 0 || doses.length > 0 || todaysEvents.length > 0) && <h2 className="section-title">Today</h2>}
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

      {/* Earlier days sit quietly below today, folded away, with a way to settle them all at once. */}
      {n > 0 && (
        <section className="list-section earlier">
          <div className="earlier-row">
            <button className="section-toggle" onClick={() => setShowEarlier((s) => !s)} aria-expanded={showEarlier}>
              {n === 1 ? "1 from earlier days" : `${n} from earlier days`}
            </button>
            <div className="earlier-actions">
              <button
                className="btn btn-soft btn-small"
                onClick={() => void store.moveMany(earlier, t, n === 1 ? `"${earlier[0].title}" is back on today.` : `${n} things are back on today.`)}
              >
                Bring into today
              </button>
              <button
                className="btn btn-quiet btn-small"
                onClick={() =>
                  void store.moveMany(
                    earlier,
                    SOMEDAY,
                    n === 1
                      ? "It's resting in Someday, in Coming up whenever you want it."
                      : "They're resting in Someday, in Coming up whenever you want them.",
                  )
                }
              >
                {n === 1 ? "Let it rest" : "Let them rest"}
              </button>
            </div>
          </div>
          <AnimatePresence initial={false}>
            {showEarlier && (
              <motion.div
                className="list"
                initial={store.reduceMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={store.reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
              >
                <AnimatePresence mode="popLayout">
                  {earlier.map((r) => (
                    <TaskCard key={r.id} r={r} onEdit={onEdit} />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

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
