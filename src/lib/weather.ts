// Mood as weather. Rain and sun both grow the tree; neither is the "right" answer.
import type { Entry } from "./api";
import { today, ymd } from "./dates";

/** 5 = bright and sunny … 1 = thunder. Stored as the mood entry's value. */
export type Weather = 1 | 2 | 3 | 4 | 5;

/**
 * Happiest first, the order they're offered in. You answer with a face (`face`, `feel`); it turns
 * into its weather (`icon`, `label`) once picked. The Android mood notification mirrors this table
 * (TendMood.kt), so keep the two in step.
 */
export const WEATHERS: { value: Weather; face: string; feel: string; icon: string; label: string; line: string }[] = [
  { value: 5, face: "😄", feel: "Great", icon: "☀️", label: "Bright & sunny", line: "Full sun. The rain from other days is what lets it bloom." },
  { value: 4, face: "🙂", feel: "Good", icon: "🌤️", label: "Sunny", line: "Sunny. The leaves are turning to the light." },
  { value: 3, face: "😐", feel: "Okay", icon: "⛅", label: "Partly cloudy", line: "Partly cloudy. Leaves like a rest from the glare." },
  { value: 2, face: "😔", feel: "Low", icon: "🌧️", label: "Rain", line: "Rain. Roots drink deepest on days like this." },
  { value: 1, face: "😣", feel: "Rough", icon: "⛈️", label: "Thunder", line: "A storm. Trees that weather them grow the deepest roots." },
];

export const weatherOf = (v: number | null | undefined) => WEATHERS.find((w) => w.value === v) ?? null;

/** The latest mood logged today; yesterday's weather has passed. */
export function todaysWeather(entries: Entry[]): Weather | null {
  const t = today();
  const latest = entries.filter((e) => e.kind === "mood" && ymd(new Date(e.at)) === t).sort((a, b) => b.at - a.at)[0];
  return latest ? (Math.min(5, Math.max(1, Math.round(latest.value))) as Weather) : null;
}

/**
 * The mood entry for a check-in at [at]. Changing your mind later the same day updates that day's
 * check-in, so seeds come once a day.
 */
export function moodEntry(entries: Entry[], v: Weather, at = Date.now()): Entry {
  const day = ymd(new Date(at));
  const existing = entries.find((e) => e.kind === "mood" && ymd(new Date(e.at)) === day);
  // A change of mind keeps what was said about why.
  return { id: existing?.id ?? "", kind: "mood", name: "Mood", value: v, value2: null, unit: "", note: existing?.note ?? "", reasons: existing?.reasons ?? [], at };
}

/** Today's check-in entry (the latest), if any. */
export function todaysMoodEntry(entries: Entry[]): Entry | null {
  const t = today();
  return entries.filter((e) => e.kind === "mood" && ymd(new Date(e.at)) === t).sort((a, b) => b.at - a.at)[0] ?? null;
}

/** Rainy and sunny days over the last month (a day counts by its last check-in). */
export function weatherDays(entries: Entry[]) {
  const byDay = new Map<string, { at: number; v: number }>();
  for (const e of entries) {
    if (e.kind !== "mood" || Date.now() - e.at > 30 * 86_400_000) continue;
    const d = ymd(new Date(e.at));
    const prev = byDay.get(d);
    if (!prev || prev.at < e.at) byDay.set(d, { at: e.at, v: e.value });
  }
  const days = [...byDay.values()];
  return { rain: days.filter((d) => d.v <= 2).length, sun: days.filter((d) => d.v >= 4).length, mild: days.filter((d) => d.v === 3).length };
}

// ---- quotes ----------------------------------------------------------------------------------

type Mood = "sun" | "cloud" | "rain" | "storm" | "any";
export interface Quote {
  text: string;
  by: string;
}

const Q: [Mood, string, string][] = [
  ["sun", "Keep your face to the sun and you will never see the shadows.", "Helen Keller"],
  ["sun", "What sunshine is to flowers, smiles are to humanity.", "Joseph Addison"],
  ["sun", "Just living is not enough… one must have sunshine, freedom, and a little flower.", "Hans Christian Andersen"],
  ["sun", "The sun does not shine for a few trees and flowers, but for the wide world's joy.", "Henry Ward Beecher"],
  ["sun", "Live in the sunshine, swim the sea, drink the wild air.", "Ralph Waldo Emerson"],
  ["sun", "The earth laughs in flowers.", "Ralph Waldo Emerson"],
  ["sun", "Where flowers bloom, so does hope.", "Lady Bird Johnson"],
  ["sun", "Sunshine all the time makes a desert.", "Arab proverb"],
  ["sun", "There's a sunrise and a sunset every single day, and they're absolutely free.", "Jo Walton"],
  ["sun", "To see a World in a Grain of Sand, and a Heaven in a Wild Flower.", "William Blake"],
  ["sun", "Wherever you go, no matter what the weather, always bring your own sunshine.", "Anthony J. D'Angelo"],
  ["sun", "A flower does not think of competing with the flower next to it. It just blooms.", "Zen Shin"],
  ["sun", "Make hay while the sun shines.", "Proverb"],
  ["cloud", "Clouds come floating into my life, no longer to carry rain or usher storm, but to add color to my sunset sky.", "Rabindranath Tagore"],
  ["cloud", "Let your life lightly dance on the edges of Time like dew on the tip of a leaf.", "Rabindranath Tagore"],
  ["cloud", "Adopt the pace of nature: her secret is patience.", "Ralph Waldo Emerson"],
  ["cloud", "Nature does not hurry, yet everything is accomplished.", "Lao Tzu"],
  ["cloud", "Nobody sees a flower really; it is so small. We haven't time, and to see takes time.", "Georgia O'Keeffe"],
  ["cloud", "Each moment of the year has its own beauty.", "Ralph Waldo Emerson"],
  ["cloud", "Trees that are slow to grow bear the best fruit.", "Molière"],
  ["cloud", "Heaven is under our feet as well as over our heads.", "Henry David Thoreau"],
  ["cloud", "In every walk with nature one receives far more than he seeks.", "John Muir"],
  ["cloud", "A garden requires patient labor and attention.", "Liberty Hyde Bailey"],
  ["rain", "Into each life some rain must fall.", "Henry Wadsworth Longfellow"],
  ["rain", "The best thing one can do when it is raining is to let it rain.", "Henry Wadsworth Longfellow"],
  ["rain", "Let the rain kiss you.", "Langston Hughes"],
  ["rain", "Rain is grace; rain is the sky descending to the earth; without rain, there would be no life.", "John Updike"],
  ["rain", "The sound of the rain needs no translation.", "Alan Watts"],
  ["rain", "What would the world be, once bereft of wet and of wildness?", "Gerard Manley Hopkins"],
  ["rain", "Flowers grow out of dark moments.", "Corita Kent"],
  ["rain", "After rain comes sunshine.", "Proverb"],
  ["rain", "No winter lasts forever; no spring skips its turn.", "Hal Borland"],
  ["rain", "To plant a garden is to believe in tomorrow.", "Audrey Hepburn"],
  ["rain", "Rain! whose soft architectural hands have power to cut stones, and chisel to shapes of grandeur the very mountains.", "Henry Ward Beecher"],
  ["rain", "I go to nature to be soothed and healed, and to have my senses put in tune once more.", "John Burroughs"],
  ["storm", "Every storm runs out of rain.", "Maya Angelou"],
  ["storm", "Life isn't about waiting for the storm to pass. It's about learning to dance in the rain.", "Vivian Greene"],
  ["storm", "Deep roots are not reached by the frost.", "J.R.R. Tolkien"],
  ["storm", "Even the darkest night will end and the sun will rise.", "Victor Hugo"],
  ["storm", "Hope is the thing with feathers… and sweetest in the gale is heard.", "Emily Dickinson"],
  ["storm", "The pessimist complains about the wind; the optimist expects it to change; the realist adjusts the sails.", "William Arthur Ward"],
  ["storm", "The rain to the wind said, 'You push and I'll pelt.'", "Robert Frost"],
  ["storm", "A smooth sea never made a skilled sailor.", "Proverb"],
  ["any", "There is no such thing as bad weather, only different kinds of good weather.", "John Ruskin"],
  ["any", "Sunshine is delicious, rain is refreshing, wind braces us up, snow is exhilarating.", "John Ruskin"],
  ["any", "Don't knock the weather; nine-tenths of the people couldn't start a conversation if it didn't change once in a while.", "Kin Hubbard"],
  ["any", "The glory of gardening: hands in the dirt, head in the sun, heart with nature.", "Alfred Austin"],
  ["any", "If you have a garden and a library, you have everything you need.", "Cicero"],
  ["any", "He that plants trees loves others besides himself.", "Thomas Fuller"],
  ["any", "The best time to plant a tree was twenty years ago. The second best time is now.", "Proverb"],
];

const moodOf = (w: Weather): Mood[] => (w >= 4 ? ["sun"] : w === 3 ? ["cloud"] : w === 2 ? ["rain"] : ["storm", "rain"]);
const RECENT_KEY = "tend.quotes.recent";

/** A quote for this weather, skipping the ones shown most recently. */
export function pickQuote(w: Weather): Quote {
  let recent: string[] = [];
  try {
    recent = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    /* fine */
  }
  const moods = moodOf(w);
  const pool = Q.filter(([m]) => moods.includes(m) || m === "any");
  const fresh = pool.filter(([, t]) => !recent.includes(t));
  // Everything seen lately: take whichever was shown longest ago.
  const pickFrom = fresh.length ? fresh : [...pool].sort((a, b) => recent.indexOf(a[1]) - recent.indexOf(b[1])).slice(0, 3);
  const [, text, by] = pickFrom[Math.floor(Math.random() * pickFrom.length)];
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([...recent.filter((t) => t !== text), text].slice(-30)));
  } catch {
    /* fine */
  }
  return { text, by };
}

/** Opens the weather map (MoodInsights) from anywhere. */
export const OPEN_INSIGHTS_EVENT = "tend:open-insights";
export const openInsights = () => window.dispatchEvent(new Event(OPEN_INSIGHTS_EVENT));

/** Opens the "what's behind it" sheet for today's check-in (from the mood notification). */
export const OPEN_MOOD_WHY_EVENT = "tend:open-mood-why";
export const openMoodWhy = () => window.dispatchEvent(new Event(OPEN_MOOD_WHY_EVENT));

/** Logged from anywhere: the shell takes you to the garden to watch the tree respond. */
export const WEATHER_EVENT = "tend:weather";
