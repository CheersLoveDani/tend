// Mood as weather. Rain and sun both grow the tree; neither is the "right" answer.
import type { Entry } from "./api";
import { today, ymd } from "./dates";

export type Weather = 1 | 2 | 3 | 4 | 5;

export const WEATHERS: { value: Weather; icon: string; label: string; line: string }[] = [
  { value: 1, icon: "🌧️", label: "Pouring", line: "Heavy rain. Roots drink deepest on days like this." },
  { value: 2, icon: "🌦️", label: "Drizzly", line: "A soft drizzle. Honestly good growing weather." },
  { value: 3, icon: "⛅", label: "Cloudy", line: "Cloudy and mild. Leaves like a rest from the glare." },
  { value: 4, icon: "🌤️", label: "Bright spells", line: "Bright spells. The leaves are turning to the light." },
  { value: 5, icon: "☀️", label: "Sunny", line: "Full sun. The rain from other days is what lets it bloom." },
];

export const weatherOf = (v: number | null | undefined) => WEATHERS.find((w) => w.value === v) ?? null;

/** The latest mood logged today; yesterday's weather has passed. */
export function todaysWeather(entries: Entry[]): Weather | null {
  const t = today();
  const latest = entries.filter((e) => e.kind === "mood" && ymd(new Date(e.at)) === t).sort((a, b) => b.at - a.at)[0];
  return latest ? (Math.min(5, Math.max(1, Math.round(latest.value))) as Weather) : null;
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
