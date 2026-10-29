// Mirrors src-tauri/src/rewards.rs so cards can show values before anything is ticked.
import type { Reminder } from "./api";

export const MAX_BITS = 3;

export const stepValue = (r: Pick<Reminder, "reward" | "steps">) =>
  Math.max(1, Math.floor((r.reward * 0.6) / Math.max(1, r.steps.length)));

export const bitValue = (r: Pick<Reminder, "reward">) => Math.max(1, Math.round(r.reward * 0.12));

export function earned(r: Reminder): number {
  if (r.status === "done") return r.reward;
  if (r.steps.length) return r.steps.filter((s) => s.done).length * stepValue(r);
  return r.bits * bitValue(r);
}

export const finishValue = (r: Reminder) =>
  Math.max(r.reward - earned(r), Math.ceil(r.reward * 0.25));
