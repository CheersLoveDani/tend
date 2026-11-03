import { motion } from "motion/react";
import { useStore } from "../lib/store";
import { dayTotals, minuteMilestones, nextMilestone, seedsAt, stepMilestones, type Milestone } from "../lib/fitness";
import { today } from "../lib/dates";
import { Seed } from "./Icons";

const Feet = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <ellipse cx="8" cy="7.5" rx="3.2" ry="4.6" />
    <ellipse cx="8.4" cy="15.2" rx="2.3" ry="1.9" />
    <ellipse cx="16" cy="10.5" rx="3.2" ry="4.6" />
    <ellipse cx="15.6" cy="18.2" rx="2.3" ry="1.9" />
  </svg>
);

const Spark = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
  </svg>
);

interface BarProps {
  icon: React.ReactNode;
  value: number;
  goal: number;
  unit: string;
  plan: Milestone[];
  compact?: boolean;
}

/** Fills to the goal, then a golden second lap shows the overflow, up to double. */
function GoalBar({ icon, value, goal, unit, plan, compact }: BarProps) {
  const { reduceMotion } = useStore();
  const p = goal > 0 ? value / goal : 0;
  const fill = Math.min(1, p);
  const over = Math.min(1, Math.max(0, p - 1));
  const reached = p >= 1;
  const maxed = p >= 2;
  const earned = seedsAt(value, goal, plan);
  const next = nextMilestone(value, goal, plan);
  const fmt = (n: number) => n.toLocaleString();
  const spring = reduceMotion ? { duration: 0 } : { type: "spring" as const, stiffness: 70, damping: 18 };

  return (
    <div className={`goal ${compact ? "is-compact" : ""} ${reached ? "is-reached" : ""} ${maxed ? "is-maxed" : ""}`}>
      <div className="goal-head">
        <span className="goal-icon">{icon}</span>
        <span className="goal-value">
          <strong>{fmt(value)}</strong>
          <span>
            {" "}
            / {fmt(goal)} {unit}
          </span>
        </span>
        {reached && (
          <motion.span className="goal-over" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring}>
            {maxed ? "double!" : value > goal ? `+${fmt(value - goal)}` : "goal!"}
          </motion.span>
        )}
        {earned > 0 && (
          <span className="goal-seeds" title={`${earned} seeds from this today`}>
            <Seed size={12} /> {earned}
          </span>
        )}
      </div>

      <div
        className="goal-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={value}
        aria-label={`${fmt(value)} of ${fmt(goal)} ${unit}`}
      >
        <motion.div className="goal-fill" initial={false} animate={{ width: `${fill * 100}%` }} transition={spring} />
        {over > 0 && <motion.div className="goal-overflow" initial={{ width: 0 }} animate={{ width: `${over * 100}%` }} transition={spring} />}
        {/* Quarter marks guide the first lap; past the goal they'd only clutter the gold. */}
        {!reached &&
          plan
            .filter((m) => m.pct < 100)
            .map((m) => <span key={m.pct} className={`goal-notch ${p * 100 >= m.pct ? "is-passed" : ""}`} style={{ left: `${m.pct}%` }} />)}
      </div>

      {!compact && (
        <p className="goal-caption">
          {next ? `${reached ? "Goal reached. " : ""}+${next.seeds} at ${fmt(next.at)} ${unit}` : "Every seed from this gathered today."}
        </p>
      )}
    </div>
  );
}

/** Today's steps and active minutes against the goals, when Health Connect is connected. */
export function GoalBars({ compact }: { compact?: boolean }) {
  const { fit, settings } = useStore();
  if (!fit || !settings.fitSince) return null;
  const { steps, minutes } = dayTotals(fit, today());
  return (
    <div className={`goal-bars ${compact ? "is-compact" : ""}`}>
      <GoalBar icon={<Feet />} value={steps} goal={settings.stepGoal} unit="steps" plan={stepMilestones(settings.stepSeeds)} compact={compact} />
      <GoalBar icon={<Spark />} value={minutes} goal={settings.moveGoal} unit="active min" plan={minuteMilestones(settings.moveSeeds)} compact={compact} />
    </div>
  );
}
