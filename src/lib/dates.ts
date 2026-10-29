import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

export const ymd = (d: Date) => format(d, "yyyy-MM-dd");
export const today = () => ymd(new Date());
export const tomorrow = () => ymd(addDays(new Date(), 1));
export const plusDays = (n: number, from = new Date()) => ymd(addDays(from, n));

/** "Today", "Tomorrow", "Thursday", "Mon 3 Nov" — calm and literal. */
export function dayName(date: string): string {
  const d = parseISO(date);
  const diff = differenceInCalendarDays(d, new Date());
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return format(d, "EEEE");
  return format(d, "EEE d MMM");
}

/** "9:30am" from "09:30". */
export function clock(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

/** Plain-words part of day, used instead of countdowns. */
export function partOfDay(time: string | null): string {
  if (!time) return "any time";
  const h = Number(time.slice(0, 2));
  if (h < 5) return "late night";
  if (h < 12) return "this morning";
  if (h < 17) return "this afternoon";
  if (h < 21) return "this evening";
  return "tonight";
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export const longDate = (d = new Date()) => format(d, "EEEE d MMMM");
