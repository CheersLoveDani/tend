// Natural-language quick add ("call mum at 6", "bins tomorrow"), shared by the share sheet,
// notification reply, widget, tile and shortcuts (via native `add` actions).
import * as chrono from "chrono-node";
import type { ReminderInput } from "./api";
import { today, ymd } from "./dates";

/** Seeds a quick-added reminder is worth until the user says otherwise. */
export const QUICK_ADD_REWARD = 10;

/** Pulls "tomorrow at 5pm" out of typed text, like the editor does. */
export function parseWhen(text: string, now = new Date()) {
  const res = chrono.en.GB.parse(text, now, { forwardDate: true })[0];
  if (!res) return null;
  const d = res.start.date();
  const hasTime = res.start.isCertain("hour");
  const cleaned = (text.slice(0, res.index) + text.slice(res.index + res.text.length))
    .replace(/\s+(at|on|by)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return {
    date: ymd(d),
    time: hasTime ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : null,
    cleaned,
    matched: res.text,
  };
}

/**
 * A reminder from quick-added text: date/time parsed out, today and untimed otherwise.
 * Long shared text (an article, a message) keeps a short title and puts the rest in notes.
 */
export function quickAddInput(text: string, now = new Date()): ReminderInput | null {
  const raw = text.trim();
  if (!raw) return null;
  const firstLine = raw.split(/\r?\n/)[0].trim();
  // Only look for a date in the first line: shared articles are full of them.
  const when = firstLine.length <= 200 ? parseWhen(firstLine, now) : null;
  let title = (when?.cleaned || firstLine).trim();
  let notes = raw === firstLine ? "" : raw;
  if (title.length > 120) {
    notes = raw;
    title = title.slice(0, 80).trimEnd() + "…";
  }
  return {
    id: null,
    title: title || firstLine.slice(0, 80),
    notes,
    date: when?.date && when.date >= today() ? when.date : today(),
    time: when?.time ?? null,
    steps: [],
    reward: QUICK_ADD_REWARD,
    suggested: null,
    repeat: null,
  };
}
