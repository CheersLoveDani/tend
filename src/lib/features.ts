// Features a person can switch on. New installs get everything that needs no permission switched
// on by default; anything they haven't seen yet (an update added it, or it needs a permission) is
// offered once in the "something new" pop-up (components/FeatureOffer.tsx).
import { isAndroid } from "./api";
import { fitSupported } from "./fitness";
import type { Settings } from "./settings";

export interface Feature {
  id: string;
  emoji: string;
  title: string;
  blurb: string;
  /** Available on this device at all. */
  available: () => boolean;
  isOn: (s: Settings) => boolean;
  /**
   * Switch it on right from the pop-up. Features that need a permission or a choice leave this
   * out and send the person to `section` in Settings instead.
   */
  turnOn?: Partial<Settings>;
  /** Settings section id (SettingsView `Group id`) where it lives. */
  section: string;
  /**
   * Settings keys this feature added. An existing install whose saved settings don't have them yet
   * gets `offPatch` instead of the new default, so the pop-up can ask rather than switch it on unasked.
   */
  keys?: (keyof Settings)[];
  offPatch?: Partial<Settings>;
}

export const FEATURES: Feature[] = [
  {
    id: "mood-reasons",
    emoji: "🌦️",
    title: "What's behind the weather",
    blurb: "After a check-in, tap what's behind it (sleep, work, friends…) or type your own. Your weather map then shows what brightens your days.",
    available: () => true,
    isOn: (s) => s.moodReasons,
    turnOn: { moodReasons: true },
    section: "your-day",
    keys: ["moodReasons"],
    offPatch: { moodReasons: false },
  },
  {
    id: "mood-check-in",
    emoji: "🌤️",
    title: "Daily weather check-in",
    blurb: isAndroid
      ? "Each evening a notification asks how the weather is in you. Tap a face right there."
      : "Each evening a small window asks how the weather is in you. Click a face.",
    available: () => true,
    isOn: (s) => !!s.moodCheckIn,
    turnOn: { moodCheckIn: "20:00" },
    section: "your-day",
  },
  {
    id: "calendar",
    emoji: "📅",
    title: "Your calendar on Today",
    blurb: "See today's events from your phone's calendars next to your tasks. Tend only reads them.",
    available: () => isAndroid,
    isOn: (s) => s.calendarEnabled,
    section: "your-day",
  },
  {
    id: "movement",
    emoji: "🚶",
    title: "Steps and workouts",
    blurb: "Seeds for moving, read from Health Connect. Workouts can tick off exercise tasks by themselves.",
    available: () => fitSupported(),
    isOn: (s) => !!s.fitSince,
    section: "movement",
  },
  {
    id: "helper",
    emoji: "🧠",
    title: "On-device helper",
    blurb: "A tiny model on your device that suggests seeds, steps and emoji. Nothing leaves your device.",
    available: () => true,
    isOn: (s) => s.useModel && s.modelConsent !== false,
    section: "rewards",
  },
];

/** What the pop-up should offer: available, not on, and not offered before. */
export const featuresToOffer = (s: Settings) => FEATURES.filter((f) => f.available() && !f.isOn(s) && !s.seenFeatures.includes(f.id));

/**
 * For an install that existed before a feature did: keep it off until the person says yes. Called
 * with the raw saved settings before they're merged over the defaults.
 */
export function holdBackNewFeatures(stored: Record<string, unknown>): Partial<Settings> {
  if (!stored.onboarded) return {};
  const patch: Partial<Settings> = {};
  for (const f of FEATURES) {
    if (f.keys && f.offPatch && f.keys.every((k) => !(k in stored))) Object.assign(patch, f.offPatch);
  }
  return patch;
}

/** A new install: everything that's on already counts as seen; the rest waits for a later visit. */
export const seenOnInstall = (s: Settings) => FEATURES.filter((f) => f.isOn(s)).map((f) => f.id);

/** Onboarding just finished: no pop-up this visit, it would be one thing too many. */
let justOnboarded = false;
export const markJustOnboarded = () => void (justOnboarded = true);
export const wasJustOnboarded = () => justOnboarded;

/** Ask the shell to open Settings at a section. */
export const OPEN_SETTINGS_EVENT = "tend:open-settings";
let pendingSection: string | null = null;
export const openSettings = (section: string) => {
  // Kept for Settings to read when it opens on the right tab (it may not be mounted yet).
  pendingSection = section;
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: section }));
};
export const takeSettingsSection = () => {
  const s = pendingSection;
  pendingSection = null;
  return s;
};
