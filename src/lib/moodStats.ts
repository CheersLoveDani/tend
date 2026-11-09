// Mood insights: pure functions over mood entries. No React, no "now" unless passed in, so it's easy
// to test. Tone rule for every string here: rain and sun both grow the tree. Nothing is "worse",
// nothing is a failure, and cloudier days are described, never judged.
import { addMonths, differenceInCalendarDays, format, getDaysInMonth, parseISO, startOfMonth, subDays } from "date-fns";
import type { Entry } from "./api";
import { WEATHERS, weatherOf, type Weather } from "./weather";

export interface Reason {
  label: string;
  emoji: string;
}

/** One day's weather: its latest mood check-in. */
export interface DayMood {
  /** yyyy-MM-dd (local). */
  date: string;
  value: Weather;
  at: number;
  reasons: Reason[];
  note: string;
}

type MoodEntry = Entry & { reasons?: Reason[] | null };

const ymd = (d: Date) => format(d, "yyyy-MM-dd");
const monthKey = (d: Date) => format(d, "yyyy-MM");
const clampW = (v: number) => Math.min(5, Math.max(1, Math.round(v))) as Weather;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const reasonKey = (r: Reason) => r.label.trim().toLowerCase();
/** "😴 Sleep" */
export const reasonText = (r: Reason) => (r.emoji ? `${r.emoji} ${r.label}` : r.label);

/** Plain words for a part of the sky. Thunder sits with rain: both are weather the roots drink. */
export type Sky = "sunny" | "cloudy" | "rainy";
export const skyOf = (v: number): Sky => (v >= 3.5 ? "sunny" : v >= 2.5 ? "cloudy" : "rainy");

/** The weather nearest an average (2.6 → partly cloudy). */
export const nearestWeather = (avg: number) => weatherOf(clampW(avg))!;

// ---- daily ---------------------------------------------------------------------------------------

/** Every day with a check-in, oldest first. A day's mood is its latest mood entry. */
export function dailyMoods(entries: Entry[]): DayMood[] {
  const byDay = new Map<string, MoodEntry>();
  for (const e of entries as MoodEntry[]) {
    if (e.kind !== "mood" || !Number.isFinite(e.value)) continue;
    const d = ymd(new Date(e.at));
    const prev = byDay.get(d);
    if (!prev || prev.at < e.at) byDay.set(d, e);
  }
  return [...byDay.entries()]
    .map(([date, e]) => ({
      date,
      value: clampW(e.value),
      at: e.at,
      reasons: dedupeReasons(e.reasons ?? []),
      note: e.note ?? "",
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function dedupeReasons(rs: Reason[]): Reason[] {
  const seen = new Set<string>();
  const out: Reason[] = [];
  for (const r of rs) {
    if (!r || !r.label?.trim()) continue;
    const k = reasonKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ label: r.label.trim(), emoji: r.emoji ?? "" });
  }
  return out;
}

/** The days falling in [month]'s calendar month. */
export function daysInMonth(days: DayMood[], month: Date): DayMood[] {
  const k = monthKey(month);
  return days.filter((d) => d.date.startsWith(k));
}

/** Days within the [n] days ending on [end] (inclusive). */
export function daysWithin(days: DayMood[], end: Date, n: number): DayMood[] {
  const from = ymd(subDays(end, n - 1));
  const to = ymd(end);
  return days.filter((d) => d.date >= from && d.date <= to);
}

// ---- month summary -------------------------------------------------------------------------------

export type Distribution = Record<Weather, number>;

export interface MonthSummary {
  /** yyyy-MM */
  month: string;
  monthName: string;
  /** Days with a check-in. */
  days: number;
  daysInMonth: number;
  average: number | null;
  distribution: Distribution;
  /** The weather seen most often (ties go to the sunnier one). */
  mostCommon: Weather | null;
  previous: { monthName: string; days: number; average: number | null };
  /** "A little sunnier than October", or null when there isn't enough to compare. */
  comparison: string | null;
}

export function distributionOf(days: DayMood[]): Distribution {
  const d: Distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const x of days) d[x.value]++;
  return d;
}

export function mostCommonOf(dist: Distribution): Weather | null {
  let best: Weather | null = null;
  for (const w of [5, 4, 3, 2, 1] as Weather[]) if (dist[w] > 0 && (best === null || dist[w] > dist[best])) best = w;
  return best;
}

/** Enough check-ins in both months to say anything about the difference. */
const MIN_TO_COMPARE = 3;

/**
 * A gentle comparison between two monthly averages: "a little sunnier than October", "much the same
 * weather as October", "a little rainier than October". Never "better" or "worse".
 */
export function compareText(avg: number | null, prevAvg: number | null, prevName: string): string | null {
  if (avg === null || prevAvg === null) return null;
  const diff = avg - prevAvg;
  if (Math.abs(diff) < 0.25) return `Much the same weather as ${prevName}`;
  const amount = Math.abs(diff) < 0.75 ? "A little" : "Quite a bit";
  return `${amount} ${diff > 0 ? "sunnier" : "rainier"} than ${prevName}`;
}

export function monthSummary(all: DayMood[], month: Date): MonthSummary {
  const m = startOfMonth(month);
  const prev = addMonths(m, -1);
  const days = daysInMonth(all, m);
  const prevDays = daysInMonth(all, prev);
  const distribution = distributionOf(days);
  const average = mean(days.map((d) => d.value));
  const prevAverage = mean(prevDays.map((d) => d.value));
  const prevName = format(prev, "MMMM");
  const comparable = days.length >= MIN_TO_COMPARE && prevDays.length >= MIN_TO_COMPARE;
  return {
    month: monthKey(m),
    monthName: format(m, "MMMM"),
    days: days.length,
    daysInMonth: getDaysInMonth(m),
    average,
    distribution,
    mostCommon: mostCommonOf(distribution),
    previous: { monthName: prevName, days: prevDays.length, average: prevAverage },
    comparison: comparable ? compareText(average, prevAverage, prevName) : null,
  };
}

// ---- weekdays ------------------------------------------------------------------------------------

export interface WeekdayStat {
  /** 0 = Monday … 6 = Sunday. */
  index: number;
  short: string;
  name: string;
  count: number;
  /** null when that weekday has too few check-ins to say. */
  average: number | null;
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Average weather by weekday, Monday first. Returns null until there's enough to see a pattern
 * ([minDays] check-ins overall); a weekday with fewer than [minPerDay] gets a null average.
 */
export function weekdayPattern(days: DayMood[], minDays = 14, minPerDay = 2): WeekdayStat[] | null {
  if (days.length < minDays) return null;
  const buckets: number[][] = WEEKDAYS.map(() => []);
  for (const d of days) buckets[(parseISO(d.date).getDay() + 6) % 7].push(d.value);
  const stats = buckets.map((vs, i) => ({
    index: i,
    short: WEEKDAYS[i].slice(0, 3),
    name: WEEKDAYS[i],
    count: vs.length,
    average: vs.length >= minPerDay ? mean(vs) : null,
  }));
  return stats.filter((s) => s.average !== null).length >= 3 ? stats : null;
}

/** "Saturdays tend to be your sunniest." Only when one weekday clearly stands out. */
export function weekdaySentence(stats: WeekdayStat[] | null): string | null {
  if (!stats) return null;
  const known = stats.filter((s) => s.average !== null) as (WeekdayStat & { average: number })[];
  if (known.length < 3) return null;
  const sorted = [...known].sort((a, b) => b.average - a.average);
  const overall = mean(known.map((s) => s.average))!;
  if (sorted[0].average - overall >= 0.4 && sorted[0].average - sorted[1].average >= 0.15) return `${sorted[0].name}s tend to be your sunniest.`;
  const low = sorted[sorted.length - 1];
  if (overall - low.average >= 0.4) return `${low.name}s often bring a bit more rain. Good to know, not something to fix.`;
  return null;
}

// ---- reasons -------------------------------------------------------------------------------------

export interface ReasonStat {
  reason: Reason;
  /** Days it was part of the check-in. */
  count: number;
  /** Average weather on those days. */
  average: number;
  /** How those days split across the sky. */
  skies: Record<Sky, number>;
  /** Average on those days minus the overall average for the same period. */
  lift: number;
}

export interface ReasonStats {
  /** Days in the period that had at least one reason. */
  daysWithReasons: number;
  overall: number | null;
  /** Most common first. */
  top: ReasonStat[];
  /** Present on brighter-than-usual days, brightest first. */
  brightens: ReasonStat[];
  /** Present on cloudier-than-usual days, cloudiest first. */
  cloudsOver: ReasonStat[];
}

/**
 * How often each reason came up and what the sky tended to be when it did. A reason needs
 * [minCount] days before it's placed on the brighter or cloudier side, so one odd day doesn't
 * become a pattern.
 */
export function reasonStats(days: DayMood[], minCount = 3, minLift = 0.35): ReasonStats {
  const overall = mean(days.map((d) => d.value));
  const map = new Map<string, { reason: Reason; values: number[] }>();
  let daysWithReasons = 0;
  for (const d of days) {
    if (d.reasons.length) daysWithReasons++;
    for (const r of d.reasons) {
      const k = reasonKey(r);
      const cur = map.get(k) ?? { reason: r, values: [] };
      cur.values.push(d.value);
      map.set(k, cur);
    }
  }
  const all: ReasonStat[] = [...map.values()].map(({ reason, values }) => {
    const average = mean(values)!;
    const skies: Record<Sky, number> = { sunny: 0, cloudy: 0, rainy: 0 };
    for (const v of values) skies[skyOf(v)]++;
    return { reason, count: values.length, average, skies, lift: overall === null ? 0 : average - overall };
  });
  const top = [...all].sort((a, b) => b.count - a.count || b.average - a.average || a.reason.label.localeCompare(b.reason.label));
  const eligible = all.filter((s) => s.count >= minCount);
  return {
    daysWithReasons,
    overall,
    top,
    brightens: eligible.filter((s) => s.lift >= minLift).sort((a, b) => b.lift - a.lift),
    cloudsOver: eligible.filter((s) => s.lift <= -minLift).sort((a, b) => a.lift - b.lift),
  };
}

// ---- longer trend --------------------------------------------------------------------------------

export interface MonthPoint {
  /** yyyy-MM */
  month: string;
  /** "Nov" */
  short: string;
  /** "November 2026" */
  long: string;
  count: number;
  average: number | null;
}

/** Monthly averages for the [months] months ending with [end]'s month, oldest first. */
export function monthlyTrend(days: DayMood[], end: Date, months = 6): MonthPoint[] {
  const last = startOfMonth(end);
  return Array.from({ length: months }, (_, i) => {
    const m = addMonths(last, i - months + 1);
    const ds = daysInMonth(days, m);
    return { month: monthKey(m), short: format(m, "MMM"), long: format(m, "MMMM yyyy"), count: ds.length, average: mean(ds.map((d) => d.value)) };
  });
}

// ---- report --------------------------------------------------------------------------------------

/** Longest run of consecutive days with a check-in. */
export function longestRun(days: DayMood[]): number {
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const d of days) {
    const cur = parseISO(d.date);
    run = prev && differenceInCalendarDays(cur, prev) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = cur;
  }
  return best;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const lowerLabel = (w: Weather) => weatherOf(w)!.label.toLowerCase();
const SKY_WORD: Record<Sky, string> = { sunny: "sunny", cloudy: "cloudy", rainy: "rainy" };

/** The most common reason on days of a given sky, if it came up at least twice. */
function commonOn(days: DayMood[], pick: (v: number) => boolean): Reason | null {
  const counts = new Map<string, { r: Reason; n: number }>();
  for (const d of days.filter((x) => pick(x.value))) for (const r of d.reasons) {
    const k = reasonKey(r);
    const c = counts.get(k) ?? { r, n: 0 };
    c.n++;
    counts.set(k, c);
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  return best && best.n >= 2 ? best.r : null;
}

/**
 * The month in a sentence or six: short, specific, warm. Empty when there were no check-ins.
 * [all] is every day (for the comparison with last month); the rest comes from [month] itself.
 */
export function monthReport(all: DayMood[], month: Date, maxSentences = 6): string[] {
  const days = daysInMonth(all, month);
  if (!days.length) return [];
  const s = monthSummary(all, month);
  const out: string[] = [];

  out.push(`You checked in on ${plural(days.length, "day")} in ${s.monthName}.`);

  if (s.mostCommon !== null && days.length >= 2) {
    const w = weatherOf(s.mostCommon)!;
    const share = s.distribution[s.mostCommon] / days.length;
    out.push(share >= 0.5 ? `Most days were ${w.icon} ${w.label.toLowerCase()}.` : `${w.icon} ${w.label} came up most often, with plenty of other weather too.`);
  }

  if (s.comparison) out.push(`Overall, ${s.comparison.charAt(0).toLowerCase()}${s.comparison.slice(1)}.`);

  const values = days.map((d) => d.value);
  const lo = Math.min(...values) as Weather;
  const hi = Math.max(...values) as Weather;
  if (hi - lo >= 3) out.push(`You saw everything from ${weatherOf(lo)!.icon} ${lowerLabel(lo)} to ${weatherOf(hi)!.icon} ${lowerLabel(hi)}. Every one of them helps the tree.`);

  const reasons = reasonStats(days, 2);
  const topReason = reasons.top[0];
  if (topReason && topReason.count >= 2) {
    const skies = (Object.entries(topReason.skies) as [Sky, number][]).sort((a, b) => b[1] - a[1]);
    const [sky, n] = skies[0];
    const where = n / topReason.count >= 0.6 ? `mostly ${SKY_WORD[sky]} ones` : "in all sorts of weather";
    out.push(`${reasonText(topReason.reason)} showed up on ${plural(topReason.count, "day")}, ${where}.`);
  }

  const sunny = commonOn(days, (v) => v >= 4);
  if (sunny) out.push(`Your sunniest days often had ${reasonText(sunny)}.`);
  const rainy = commonOn(days, (v) => v <= 2);
  if (rainy && (!sunny || reasonKey(rainy) !== reasonKey(sunny))) out.push(`On rainier days, ${reasonText(rainy)} was often around. Worth being gentle with.`);

  const run = longestRun(days);
  if (run >= 3) out.push(`Your longest run of check-ins was ${run} days in a row.`);

  const wk = weekdaySentence(weekdayPattern(days, 12, 2));
  if (wk) out.push(wk);

  if (days.length === 1) out.push("One check-in is a start. The map fills in a day at a time.");
  return out.slice(0, maxSentences);
}

/** Every weather, sunniest first, for legends and distribution rows. */
export const WEATHER_ORDER = WEATHERS.map((w) => w.value);
