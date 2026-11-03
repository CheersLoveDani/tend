export interface Settings {
  sound: boolean;
  volume: number;
  reduceMotion: "system" | "on" | "off";
  theme: "system" | "light" | "dark";
  surpriseBonuses: boolean;
  persistentNotification: boolean;
  nagOnUnlock: boolean;
  /** When the unlock screen may show again: -1 = after each chime, 0 = every unlock, else minutes. */
  nagEvery: number;
  quietHours: { start: string; end: string } | null;
  /** Gentle notification sound while things are waiting, every N minutes (0 = off). */
  chimeMinutes: number;
  useModel: boolean;
  autoUpdate: boolean;
  onboarded: boolean;
  /** Day steps and workouts started counting (Health Connect), or null when not connected. */
  fitSince: string | null;
  /** Daily step goal, and the seeds reaching it is worth. */
  stepGoal: number;
  stepSeeds: number;
  /** Daily active-minutes goal (from logged workouts), and its seeds. */
  moveGoal: number;
  moveSeeds: number;
}

export const defaultSettings: Settings = {
  sound: true,
  volume: 0.7,
  reduceMotion: "system",
  theme: "system",
  surpriseBonuses: true,
  persistentNotification: true,
  nagOnUnlock: true,
  nagEvery: -1,
  quietHours: { start: "22:30", end: "07:30" },
  chimeMinutes: 15,
  useModel: true,
  autoUpdate: true,
  onboarded: false,
  fitSince: null,
  stepGoal: 6000,
  stepSeeds: 15,
  moveGoal: 20,
  moveSeeds: 10,
};

export function inQuietHours(q: Settings["quietHours"], now = new Date()): boolean {
  if (!q) return false;
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return q.start <= q.end ? hm >= q.start && hm < q.end : hm >= q.start || hm < q.end;
}
