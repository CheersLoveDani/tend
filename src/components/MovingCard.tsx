import { format, isToday } from "date-fns";
import { useStore } from "../lib/store";
import { minutesOf, workoutName } from "../lib/fitness";
import { GoalBars } from "./GoalBars";

/** Today's goals and this week's workouts, when Health Connect is connected. */
export function MovingCard() {
  const { fit, settings } = useStore();
  if (!fit || !settings.fitSince) return null;
  const since = new Date(settings.fitSince + "T00:00").getTime();
  const workouts = fit.workouts.filter((w) => fit.counted.includes(w.id) && w.end >= since).sort((a, b) => b.start - a.start);

  return (
    <section className="list-section moving">
      <h2 className="section-title">Moving</h2>
      <GoalBars />
      {workouts.length > 0 && (
        <ul className="moving-workouts">
          {workouts.map((w) => (
            <li key={w.id}>
              <span>
                {workoutName(w)}
                <span className="row-hint"> · {isToday(w.start) ? "today" : format(w.start, "EEEE")}</span>
              </span>
              <span className="row-hint">{minutesOf(w)} min</span>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">Any movement counts. A short walk is a real one.</p>
    </section>
  );
}
