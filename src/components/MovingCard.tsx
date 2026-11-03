import { motion } from "motion/react";
import { format, isToday } from "date-fns";
import { useStore } from "../lib/store";
import { STEP_TIERS, minutesOf, nextTier, stepSeeds, workoutName, workoutSeeds } from "../lib/fitness";
import { today } from "../lib/dates";
import { Seed } from "./Icons";

/** Today's steps and this week's workouts, when Health Connect is connected. */
export function MovingCard() {
  const { fit, settings } = useStore();
  if (!fit || !settings.fitSince) return null;
  const steps = fit.days.find((d) => d.date === today())?.steps ?? 0;
  const next = nextTier(steps);
  // The milestone already passed, so the bar fills from there to the next one.
  const prev = [0, ...STEP_TIERS.map(([t]) => t)].filter((t) => t <= steps).pop()!;
  const progress = next ? (steps - prev) / (next[0] - prev) : 1;
  const workouts = fit.workouts
    .filter((w) => fit.counted.includes(w.id) && w.end >= new Date(settings.fitSince + "T00:00").getTime())
    .sort((a, b) => b.start - a.start);

  return (
    <section className="list-section moving">
      <h2 className="section-title">Moving</h2>
      <div className="moving-card">
        <div className="moving-steps">
          <strong>{steps.toLocaleString()}</strong>
          <span>steps today</span>
          {stepSeeds(steps) > 0 && (
            <span className="moving-earned">
              <Seed size={12} /> {stepSeeds(steps)}
            </span>
          )}
        </div>
        <div className="level-bar" role="progressbar" aria-valuemin={prev} aria-valuemax={next?.[0] ?? steps} aria-valuenow={steps} aria-label="Steps to the next milestone">
          <motion.div className="level-bar-fill" initial={{ width: 0 }} animate={{ width: `${progress * 100}%` }} transition={{ type: "spring", stiffness: 60, damping: 18 }} />
        </div>
        <p className="level-caption">
          {next ? `+${next[1]} seeds at ${next[0].toLocaleString()} steps` : "Every step milestone reached today."}
        </p>
        {workouts.length > 0 && (
          <ul className="moving-workouts">
            {workouts.map((w) => (
              <li key={w.id}>
                <span>
                  {workoutName(w)}
                  <span className="row-hint">
                    {" "}
                    · {minutesOf(w)} min · {isToday(w.start) ? "today" : format(w.start, "EEEE")}
                  </span>
                </span>
                <span className="moving-earned">
                  <Seed size={12} /> {workoutSeeds(minutesOf(w))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="hint">Any movement counts. A short walk is a real one.</p>
    </section>
  );
}
