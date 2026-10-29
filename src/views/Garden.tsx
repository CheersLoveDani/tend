import { motion } from "motion/react";
import { format, parseISO } from "date-fns";
import { useStore } from "../lib/store";
import { Tree } from "../components/Tree";
import { Seed } from "../components/Icons";

const STAGES = ["Seed", "Sprout", "Seedling", "Sapling", "Young tree", "Leafy tree", "Blossoming tree", "Fruit tree", "Old oak", "Grove"];

export function Garden() {
  const { snap, reduceMotion } = useStore();
  if (!snap) return null;
  const { level, days } = snap;
  const progress = level.intoLevel / level.levelSize;
  const tended = days.filter((d) => d.seeds > 0).length;
  const finished = days.reduce((n, d) => n + d.done, 0);
  const max = Math.max(10, ...days.map((d) => d.seeds));
  const stageIdx = STAGES.indexOf(level.stage);

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
        <Tree level={level.level} progress={progress} size={280} still={reduceMotion} />
        <div className="level-bar" role="progressbar" aria-valuemin={0} aria-valuemax={level.levelSize} aria-valuenow={level.intoLevel} aria-label="Progress to next level">
          <motion.div className="level-bar-fill" initial={{ width: 0 }} animate={{ width: `${progress * 100}%` }} transition={{ type: "spring", stiffness: 60, damping: 18 }} />
        </div>
        <p className="level-caption">
          {level.levelSize - level.intoLevel} seeds until level {level.level + 1}
        </p>
      </div>

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
