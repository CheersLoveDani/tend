// Steps and workouts from Health Connect (Android), where Google Fit, Samsung Health, Fitbit and
// most fitness apps keep their data. Seeds are paid by the Rust side (src-tauri/src/fitness.rs).
import { invoke } from "@tauri-apps/api/core";
import { isAndroid, type RewardEvent } from "./api";
import type { Settings } from "./settings";
import { ymd } from "./dates";

const P = "plugin:tend-native|";

export interface FitStatus {
  status: "available" | "update" | "unavailable" | "unsupported";
  steps: boolean;
  workouts: boolean;
}

export interface FitDay {
  date: string;
  steps: number;
}

export interface FitWorkout {
  id: string;
  start: number;
  end: number;
  /** Health Connect's exercise type. */
  type: number;
  title: string;
  app: string;
}

export interface FitData {
  days: FitDay[];
  workouts: FitWorkout[];
  /** Workouts that count (a copy logged by a second app doesn't). */
  counted: string[];
}

export interface FitResult {
  event: RewardEvent;
  earned: { label: string; amount: number }[];
  counted: string[];
  /** Exercise tasks that just ticked themselves off. */
  completed: RewardEvent[];
}

/** One seed payout on the way to (and past) a goal. */
export interface Milestone {
  pct: number;
  seeds: number;
}

// Mirrors `milestones` in src-tauri/src/fitness.rs.
function milestones(reward: number, lead: number[], leadShare: number, over: number[], overShare: number): Milestone[] {
  const each = (share: number) => Math.max(1, Math.round(reward * share));
  const out = lead.map((pct) => ({ pct, seeds: each(leadShare) }));
  const leadTotal = out.reduce((n, m) => n + m.seeds, 0);
  out.push({ pct: 100, seeds: Math.max(1, reward - leadTotal) });
  return [...out, ...over.map((pct) => ({ pct, seeds: each(overShare) }))];
}

export const stepMilestones = (reward: number) => milestones(reward, [25, 50, 75], 0.15, [125, 150, 175, 200], 0.1);
export const minuteMilestones = (reward: number) => milestones(reward, [50], 0.3, [150, 200], 0.15);
export const WORKOUT_SEEDS = 2;

/** Seeds already earned at `value` of `goal`. */
export const seedsAt = (value: number, goal: number, plan: Milestone[]) =>
  plan.filter((m) => value * 100 >= goal * m.pct).reduce((n, m) => n + m.seeds, 0);

/** The next milestone and the value needed for it, or null past the last one. */
export function nextMilestone(value: number, goal: number, plan: Milestone[]) {
  const m = plan.find((x) => value * 100 < goal * x.pct);
  return m ? { ...m, at: Math.ceil((goal * m.pct) / 100) } : null;
}

// Health Connect's ExerciseSessionRecord.EXERCISE_TYPE_* values for the common ones.
const TYPES: Record<number, string> = {
  2: "Badminton",
  5: "Basketball",
  8: "Cycling",
  9: "Exercise bike",
  10: "Boot camp",
  11: "Boxing",
  13: "Calisthenics",
  16: "Dancing",
  25: "Elliptical",
  26: "Exercise class",
  32: "Golf",
  36: "HIIT",
  37: "Hike",
  44: "Martial arts",
  48: "Pilates",
  51: "Climbing",
  53: "Rowing",
  54: "Rowing machine",
  56: "Run",
  57: "Treadmill run",
  60: "Skating",
  61: "Skiing",
  64: "Football",
  66: "Squash",
  68: "Stair climbing",
  70: "Strength training",
  71: "Stretching",
  73: "Open water swim",
  74: "Swim",
  75: "Table tennis",
  76: "Tennis",
  79: "Walk",
  81: "Weightlifting",
  82: "Wheelchair",
  83: "Yoga",
};

/** What an exercise task can ask for. Each groups the Health Connect types that count. */
export const EXERCISES: { key: string; label: string; noun: string; types: number[] }[] = [
  { key: "any", label: "Any workout", noun: "workout", types: [] },
  { key: "walk", label: "Walk", noun: "walk", types: [79, 82] },
  { key: "run", label: "Run", noun: "run", types: [56, 57] },
  { key: "cycle", label: "Cycle", noun: "bike ride", types: [8, 9] },
  { key: "swim", label: "Swim", noun: "swim", types: [73, 74] },
  { key: "yoga", label: "Yoga or pilates", noun: "yoga or pilates session", types: [83, 48] },
  { key: "strength", label: "Strength", noun: "strength workout", types: [70, 81, 13] },
  { key: "stretch", label: "Stretch", noun: "stretch", types: [71] },
  { key: "hiit", label: "HIIT", noun: "HIIT workout", types: [36, 10, 26] },
  { key: "dance", label: "Dance", noun: "dance", types: [16] },
  { key: "hike", label: "Hike", noun: "hike", types: [37] },
];

export const exerciseOf = (types: number[]) =>
  EXERCISES.find((e) => e.types.length === types.length && e.types.every((t) => types.includes(t))) ?? null;

export const workoutName = (w: Pick<FitWorkout, "type" | "title">) => w.title.trim() || TYPES[w.type] || "Workout";

/** Whole minutes, as the Rust side counts them. */
export const minutesOf = (w: Pick<FitWorkout, "start" | "end">) => Math.floor((w.end - w.start) / 60_000);

/** Steps and active minutes for a local day. */
export function dayTotals(fit: FitData, date: string) {
  const steps = fit.days.find((d) => d.date === date)?.steps ?? 0;
  const minutes = fit.workouts
    .filter((w) => fit.counted.includes(w.id) && ymd(new Date(w.start)) === date)
    .reduce((n, w) => n + minutesOf(w), 0);
  return { steps, minutes };
}

/** Android, or the browser preview (which fakes Health Connect; see mock.ts). */
export const fitSupported = () => isAndroid || "__TEND_MOCK_FIT__" in window;

const unsupported: FitStatus = { status: "unsupported", steps: false, workouts: false };

export const fitness = {
  status: () => (fitSupported() ? invoke<FitStatus>(`${P}health_status`) : Promise.resolve(unsupported)),
  /** Opens Health Connect's permission screen, or the store if it needs installing or updating. */
  connect: () => invoke<FitStatus>(`${P}health_request`),
  read: (days = 7) => invoke<{ days: FitDay[]; workouts: FitWorkout[] }>(`${P}health_read`, { days }),
  award: (s: Settings, days: FitDay[], workouts: FitWorkout[]) =>
    invoke<FitResult>("fit_award", {
      input: {
        since: s.fitSince,
        goals: { steps: s.stepGoal, stepSeeds: s.stepSeeds, minutes: s.moveGoal, minuteSeeds: s.moveSeeds },
        days,
        workouts: workouts.map((w) => ({ id: w.id, start: w.start, end: w.end, kind: w.type, label: workoutName(w) })),
      },
    }),
};

/** One line for a toast: "+9 seeds · 6,000 steps today". */
export function earnedText(r: FitResult): string {
  const total = r.earned.reduce((n, e) => n + e.amount, 0);
  if (r.earned.length === 1) return `+${total} seeds · ${r.earned[0].label}`;
  return `+${total} seeds for moving: ${r.earned.map((e) => e.label).join("; ")}`;
}
