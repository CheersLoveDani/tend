// Steps and workouts from Health Connect (Android), where Google Fit, Samsung Health, Fitbit and
// most fitness apps keep their data. Seeds are paid by the Rust side (src-tauri/src/fitness.rs).
import { invoke } from "@tauri-apps/api/core";
import { isAndroid, type RewardEvent } from "./api";

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
  /** Workouts that earn seeds (duplicates logged by a second app don't). */
  counted: string[];
}

export interface FitResult {
  event: RewardEvent;
  earned: { label: string; amount: number }[];
  counted: string[];
}

/** `[steps, seeds]`: each milestone pays once a day. Mirrors src-tauri/src/fitness.rs. */
export const STEP_TIERS: [number, number][] = [
  [2_000, 3],
  [4_000, 3],
  [6_000, 4],
  [8_000, 5],
  [10_000, 5],
  [15_000, 5],
];

export const workoutSeeds = (minutes: number) => (minutes < 5 ? 0 : Math.min(20, 3 + Math.floor(minutes / 5)));

export const nextTier = (steps: number) => STEP_TIERS.find(([t]) => steps < t) ?? null;

export const stepSeeds = (steps: number) => STEP_TIERS.filter(([t]) => steps >= t).reduce((n, [, s]) => n + s, 0);

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

export const workoutName = (w: Pick<FitWorkout, "type" | "title">) => w.title.trim() || TYPES[w.type] || "Workout";

export const minutesOf = (w: Pick<FitWorkout, "start" | "end">) => Math.round((w.end - w.start) / 60_000);

const unsupported: FitStatus = { status: "unsupported", steps: false, workouts: false };

export const fitness = {
  status: () => (isAndroid ? invoke<FitStatus>(`${P}health_status`) : Promise.resolve(unsupported)),
  /** Opens Health Connect's permission screen, or the store if it needs installing or updating. */
  connect: () => invoke<FitStatus>(`${P}health_request`),
  read: (days = 7) => invoke<{ days: FitDay[]; workouts: FitWorkout[] }>(`${P}health_read`, { days }),
  award: (since: string, days: FitDay[], workouts: FitWorkout[]) =>
    invoke<FitResult>("fit_award", {
      input: {
        since,
        days,
        workouts: workouts.map((w) => ({ id: w.id, start: w.start, end: w.end, label: workoutName(w) })),
      },
    }),
};

/** One line for a toast: "+9 seeds · 6,000 steps today". */
export function earnedText(r: FitResult): string {
  const total = r.earned.reduce((n, e) => n + e.amount, 0);
  if (r.earned.length === 1) return `+${total} seeds · ${r.earned[0].label}`;
  return `+${total} seeds for moving: ${r.earned.map((e) => e.label).join("; ")}`;
}
