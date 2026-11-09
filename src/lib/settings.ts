import type { MoodReason } from "./api";

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

  // ---- 0.3 streamlining (see the contract in the scratchpad / PR notes) ----
  /** Accessibility: unlock-screen rows show Done / Tomorrow / Not now buttons instead of needing a swipe. */
  unlockButtons: boolean;
  /** Epoch ms until which chimes, nudges and the unlock screen stay quiet ("Quiet for today"). Doses still remind. */
  pausedUntil: number | null;
  /** Most times a day the unlock screen may show (0 = no limit). */
  nagDailyCap: number;
  /** A timed reminder nudges once at its time, then once more after this many minutes (0 = never again), then goes silent. */
  nudgeAgainMinutes: number;
  /** Doses re-remind every N minutes (0 = once) until `doseNagUntilMinutes` after they were due. */
  doseNagMinutes: number;
  doseNagUntilMinutes: number;
  /** Heads-up this many minutes before a timed reminder ("in 10 min: leave for the dentist"); 0 = off. */
  preWarnMinutes: number;
  /** How non-dose nudges arrive: a sound, a vibration only, or silently in the notification shade. */
  cueStyle: "sound" | "vibrate" | "silent";
  /** In-app sounds (names from sound.ts `sounds`) the user has switched off. */
  mutedSounds: string[];
  /** Show the phone's calendar events (Android, read-only) alongside tasks. */
  calendarEnabled: boolean;
  /** Calendar ids to show; empty = all visible calendars. */
  calendarIds: string[];
  /** On a stormy check-in, gently offer to pick one thing and move the rest to tomorrow. */
  stormyLightDay: boolean;
  /** A daily "how's the weather in you?" at this time ("HH:MM"), answered right from the notification; null = off. */
  moodCheckIn: string | null;
  /** Last app version whose "what changed" note was seen. */
  lastSeenVersion: string | null;
  /** The user has said yes (or no) to downloading the on-device model. null = not asked yet. */
  modelConsent: boolean | null;
  /** After a weather check-in, ask what's behind it (chips + your own words). */
  moodReasons: boolean;
  /** The reasons offered as one-tap chips, in order. */
  moodReasonOptions: MoodReason[];
  /** Stable releases only, or unstable pre-releases too (updater.ts). */
  updateChannel: "stable" | "unstable";
  /** Features (ids from features.ts) already offered in the "something new" pop-up. */
  seenFeatures: string[];
}

/** The reasons a fresh install starts with. Editable in Settings → Your day. */
export const DEFAULT_MOOD_REASONS: MoodReason[] = [
  { label: "Sleep", emoji: "😴" },
  { label: "Work", emoji: "💼" },
  { label: "Friends", emoji: "👯" },
  { label: "Family", emoji: "🏡" },
  { label: "Health", emoji: "🩺" },
  { label: "Exercise", emoji: "🏃" },
  { label: "Food", emoji: "🍽️" },
  { label: "Weather", emoji: "🌦️" },
  { label: "Money", emoji: "💸" },
  { label: "Rest", emoji: "🛋️" },
];

export const defaultSettings: Settings = {
  sound: true,
  volume: 0.7,
  reduceMotion: "system",
  theme: "system",
  surpriseBonuses: true,
  persistentNotification: true,
  nagOnUnlock: true,
  nagEvery: 60,
  quietHours: { start: "22:30", end: "07:30" },
  chimeMinutes: 60,
  useModel: true,
  autoUpdate: true,
  onboarded: false,
  fitSince: null,
  stepGoal: 6000,
  stepSeeds: 15,
  moveGoal: 20,
  moveSeeds: 10,
  unlockButtons: false,
  pausedUntil: null,
  nagDailyCap: 6,
  nudgeAgainMinutes: 30,
  doseNagMinutes: 30,
  doseNagUntilMinutes: 120,
  preWarnMinutes: 10,
  cueStyle: "sound",
  mutedSounds: ["tap"],
  calendarEnabled: false, // needs calendar access: offered by the "something new" pop-up
  calendarIds: [],
  stormyLightDay: true,
  moodCheckIn: "20:00",
  lastSeenVersion: null,
  modelConsent: null,
  moodReasons: true,
  moodReasonOptions: DEFAULT_MOOD_REASONS,
  seenFeatures: [],
  updateChannel: "stable",
};

/** Quiet / Gentle / Persistent: what onboarding and Settings offer as one-tap starting points. */
export const NUDGE_PRESETS: Record<"quiet" | "gentle" | "persistent", Partial<Settings>> = {
  quiet: { chimeMinutes: 0, nagOnUnlock: false, nudgeAgainMinutes: 0, preWarnMinutes: 0, cueStyle: "silent" },
  gentle: { chimeMinutes: 60, nagOnUnlock: true, nagEvery: 60, nagDailyCap: 6, nudgeAgainMinutes: 30, preWarnMinutes: 10, cueStyle: "sound" },
  persistent: { chimeMinutes: 30, nagOnUnlock: true, nagEvery: -1, nagDailyCap: 0, nudgeAgainMinutes: 15, preWarnMinutes: 10, cueStyle: "sound" },
};

/** How each preset is described, in onboarding and Settings. */
export const PRESET_TEXT: { value: keyof typeof NUDGE_PRESETS; label: string; hint: string }[] = [
  { value: "quiet", label: "Quiet", hint: "No chimes. Things wait in the app and a silent notification. Doses still remind." },
  { value: "gentle", label: "Gentle", hint: "A soft nudge when something's time comes, once more later, then quiet." },
  { value: "persistent", label: "Persistent", hint: "Nudges more often and shows what's waiting each time you unlock." },
];

/** Is "Quiet for today" on right now? */
export const isPaused = (s: Pick<Settings, "pausedUntil">, now = Date.now()) => !!s.pausedUntil && s.pausedUntil > now;

/** The end of today, for "Quiet for today". */
export function endOfToday(now = new Date()): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function inQuietHours(q: Settings["quietHours"], now = new Date()): boolean {
  if (!q) return false;
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return q.start <= q.end ? hm >= q.start && hm < q.end : hm >= q.start || hm < q.end;
}
