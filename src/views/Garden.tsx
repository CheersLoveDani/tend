import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { format, parseISO } from "date-fns";
import { useStore } from "../lib/store";
import { Tree } from "../components/Tree";
import { Seed } from "../components/Icons";
import { Sky } from "../components/Sky";
import { WeatherCheckIn } from "../components/WeatherCheckIn";
import { MovingCard } from "../components/MovingCard";
import { AutoHeight } from "../components/AutoHeight";
import { openInsights, todaysWeather, weatherDays, weatherOf, type Quote, type Weather } from "../lib/weather";

/** A check-in just happened: the tree reacts and a quote appears. */
export interface WeatherMoment {
  key: number;
  weather: Weather;
  quote: Quote;
}

// How the tree answers each weather: stretch up to the sun, drink in the rain, hold firm in a storm.
const RESPONSE: Record<Weather, { scaleY: number[]; scaleX: number[]; rotate: number[]; y: number[] }> = {
  5: { scaleY: [1, 1.12, 1.04, 1.08, 1], scaleX: [1, 0.96, 1, 0.98, 1], rotate: [0, 0, 0, 0, 0], y: [0, -10, -2, -5, 0] },
  4: { scaleY: [1, 1.08, 1, 1.04, 1], scaleX: [1, 0.98, 1, 0.99, 1], rotate: [0, 1.5, -1, 0.5, 0], y: [0, -6, 0, -3, 0] },
  3: { scaleY: [1, 1.03, 0.99, 1.02, 1], scaleX: [1, 1, 1, 1, 1], rotate: [0, -2, 2, -1, 0], y: [0, -2, 0, -1, 0] },
  2: { scaleY: [1, 0.95, 1.06, 0.99, 1], scaleX: [1, 1.03, 0.98, 1, 1], rotate: [0, -3, 3, -1.5, 0], y: [0, 3, -4, 0, 0] },
  1: { scaleY: [1, 0.93, 1.05, 0.97, 1.03, 1], scaleX: [1, 1.04, 0.98, 1.02, 0.99, 1], rotate: [0, -6, 5, -4, 2, 0], y: [0, 4, -3, 2, -2, 0] },
};

const STAGES = ["Seed", "Sprout", "Seedling", "Sapling", "Young tree", "Leafy tree", "Blossoming tree", "Fruit tree", "Old oak", "Grove"];

export function Garden({ moment, onMomentDone }: { moment?: WeatherMoment | null; onMomentDone?: () => void }) {
  const { snap, reduceMotion } = useStore();
  useEffect(() => {
    if (!moment) return;
    document.querySelector(".main")?.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    const t = setTimeout(() => onMomentDone?.(), 14_000);
    return () => clearTimeout(t);
  }, [moment?.key]);
  if (!snap) return null;
  const { level, days } = snap;
  const progress = level.intoLevel / level.levelSize;
  const tended = days.filter((d) => d.seeds > 0).length;
  const finished = days.reduce((n, d) => n + d.done, 0);
  const max = Math.max(10, ...days.map((d) => d.seeds));
  const stageIdx = STAGES.indexOf(level.stage);
  const weather = moment?.weather ?? todaysWeather(snap.entries);
  const response = moment && !reduceMotion ? RESPONSE[moment.weather] : null;
  const spread = weatherDays(snap.entries);

  return (
    <div className="view garden">
      <header className="view-head">
        <p className="view-kicker">Your garden</p>
        <h1>
          Level {level.level}, {level.stage.toLowerCase()}
        </h1>
        <p className="view-sub">
          <Seed size={13} /> {level.xp} seeds gathered in total. Seeds never wilt or go away.
        </p>
      </header>

      <div className="garden-hero">
        <Sky weather={weather}>
          <motion.div
            key={moment?.key ?? "still"}
            className="tree-response"
            initial={false}
            animate={response ?? undefined}
            transition={{ duration: moment?.weather === 1 ? 2.4 : 2, ease: "easeInOut", delay: 0.35 }}
          >
            <Tree level={level.level} progress={progress} size={280} still={reduceMotion} />
          </motion.div>
        </Sky>
        {/* The quote eases the rest of the page down instead of shoving it. */}
        <AutoHeight className="garden-moment" reduceMotion={reduceMotion}>
          <AnimatePresence mode="wait">
            {moment && (
              <motion.figure
                key={moment.key}
                className={`weather-quote wq-${moment.weather}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0, transition: { delay: reduceMotion ? 0 : 0.9, duration: 0.5 } }}
                exit={{ opacity: 0, y: -6 }}
                onClick={onMomentDone}
              >
                <blockquote>“{moment.quote.text}”</blockquote>
                <figcaption>{moment.quote.by}</figcaption>
              </motion.figure>
            )}
          </AnimatePresence>
        </AutoHeight>
        <div className="level-bar" role="progressbar" aria-valuemin={0} aria-valuemax={level.levelSize} aria-valuenow={level.intoLevel} aria-label="Progress to next level">
          <motion.div className="level-bar-fill" initial={{ width: 0 }} animate={{ width: `${progress * 100}%` }} transition={{ type: "spring", stiffness: 60, damping: 18 }} />
        </div>
        <p className="level-caption">
          {level.levelSize - level.intoLevel} seeds until level {level.level + 1}
        </p>
      </div>

      <section className="list-section weather-section">
        <h2 className="section-title">Weather inside today</h2>
        <WeatherCheckIn />
        <AutoHeight reduceMotion={reduceMotion}>
          <p className="hint">{weatherOf(weather)?.line ?? "However it is in there, say so. Rain and sun both help it grow."}</p>
          {spread.rain + spread.sun + spread.mild > 0 && (
            <p className="weather-spread">
              This month: {spread.rain} rainy or stormy {spread.rain === 1 ? "day" : "days"}, {spread.mild} cloudy, {spread.sun} sunny. A tree needs every one of them.
            </p>
          )}
        </AutoHeight>
        <button className="btn btn-soft weather-map-btn" onClick={openInsights}>
          <span aria-hidden>🗺️</span> Your weather map
        </button>
      </section>

      <MovingCard />

      <div className="stats">
        <div className="stat">
          <strong>{tended}</strong>
          <span>days tended in the last 30</span>
        </div>
        <div className="stat">
          <strong>{finished}</strong>
          <span>things finished in the last 30 days</span>
        </div>
      </div>

      <section className="list-section">
        <h2 className="section-title">Seeds gathered each day</h2>
        <div className="bars" role="img" aria-label="Seeds gathered per day over the last 30 days">
          {days.map((d, i) => (
            <div key={d.date} className="bar-col" title={`${format(parseISO(d.date), "EEE d MMM")}: ${d.seeds} seeds`}>
              <motion.div
                className={`bar ${d.seeds === 0 ? "is-rest" : ""}`}
                initial={{ height: 0 }}
                animate={{ height: d.seeds === 0 ? 4 : `${Math.max(8, (d.seeds / max) * 100)}%` }}
                transition={{ delay: reduceMotion ? 0 : i * 0.015, type: "spring", stiffness: 120, damping: 18 }}
              />
            </div>
          ))}
        </div>
        <div className="bars-axis">
          <span>{format(parseISO(days[0].date), "d MMM")}</span>
          <span>Today</span>
        </div>
        <p className="hint">Quiet days are rest days. They don't undo anything.</p>
      </section>

      <section className="list-section">
        <h2 className="section-title">How your tree grows</h2>
        <ol className="stages">
          {STAGES.map((s, i) => (
            <li key={s} className={i < stageIdx ? "is-past" : i === stageIdx ? "is-now" : ""}>
              <span className="stage-dot" />
              <span className="stage-name">{s}</span>
              <span className="stage-level">level {i * 3 + 1}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
