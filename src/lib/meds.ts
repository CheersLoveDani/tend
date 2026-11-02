// Shared bits for medication: forms, icon shapes and colours, and wording.
import type { DoseSlot, EntryKind, Med, Schedule } from "./api";
import { clock } from "./dates";

/** Units of one dose. `one` / `many` are the singular and plural shown next to a number. */
export const FORMS: { value: string; one: string; many: string; icon: string }[] = [
  { value: "pill", one: "pill", many: "pills", icon: "round" },
  { value: "tablet", one: "tablet", many: "tablets", icon: "oval" },
  { value: "capsule", one: "capsule", many: "capsules", icon: "capsule" },
  { value: "drop", one: "drop", many: "drops", icon: "drop" },
  { value: "ml", one: "ml", many: "ml", icon: "bottle" },
  { value: "mg", one: "mg", many: "mg", icon: "round" },
  { value: "g", one: "g", many: "g", icon: "sachet" },
  { value: "IU", one: "IU", many: "IU", icon: "round" },
  { value: "unit", one: "unit", many: "units", icon: "syringe" },
  { value: "injection", one: "injection", many: "injections", icon: "syringe" },
  { value: "puff", one: "puff", many: "puffs", icon: "inhaler" },
  { value: "spray", one: "spray", many: "sprays", icon: "spray" },
  { value: "patch", one: "patch", many: "patches", icon: "patch" },
  { value: "sachet", one: "sachet", many: "sachets", icon: "sachet" },
  { value: "application", one: "application", many: "applications", icon: "tube" },
  { value: "teaspoon", one: "teaspoon", many: "teaspoons", icon: "spoon" },
  { value: "tablespoon", one: "tablespoon", many: "tablespoons", icon: "spoon" },
  { value: "suppository", one: "suppository", many: "suppositories", icon: "oval" },
  { value: "ampoule", one: "ampoule", many: "ampoules", icon: "bottle" },
  { value: "portion", one: "portion", many: "portions", icon: "spoon" },
];

export const ICONS = ["round", "oval", "capsule", "split", "drop", "bottle", "syringe", "inhaler", "spray", "patch", "sachet", "tube", "spoon"] as const;

/** Colour name → [fill, second half / accent]. Chosen to read on both themes. */
export const COLORS: Record<string, [string, string]> = {
  white: ["#f4f1ea", "#d9d3c6"],
  sage: ["#86ad74", "#5b8a5c"],
  sky: ["#8fb7dd", "#5a88b8"],
  lilac: ["#b7a6dc", "#8a74c2"],
  rose: ["#eda7b4", "#cf6f84"],
  coral: ["#ef9a78", "#d46a45"],
  sun: ["#f0cd6a", "#d9a93a"],
  sand: ["#d8b98f", "#a9845a"],
  slate: ["#9aa5ad", "#66737c"],
};

export const formOf = (value: string) => FORMS.find((f) => f.value === value) ?? { value, one: value, many: value, icon: "round" };

export function num(n: number) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** "1 capsule", "2 pills", "0.5 ml" */
export function amountText(amount: number, form: string) {
  const f = formOf(form);
  return `${num(amount)} ${amount === 1 ? f.one : f.many}`;
}

export const displayName = (m: Pick<Med, "name" | "strength">) =>
  !m.strength.trim() || m.name.includes(m.strength.trim()) ? m.name : `${m.name} ${m.strength.trim()}`;

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function scheduleText(s: Schedule) {
  const times = s.times.map((t) => clock(t.time)).join(", ");
  switch (s.kind) {
    case "daily":
      return `Every day · ${times}`;
    case "interval":
      return `${s.every === 2 ? "Every other day" : `Every ${s.every} days`} · ${times}`;
    case "weekdays":
      return `${s.days.length === 7 ? "Every day" : s.days.map((d) => DAY_NAMES[d]).join(", ")} · ${times}`;
    case "cycle":
      return `${s.onDays} days on, ${s.offDays} off · ${times}`;
    default:
      return "When needed";
  }
}

export const doseLabel = (d: DoseSlot) => `${d.name}, ${amountText(d.amount, d.form)}`;

/** Popular readings, with how they're entered. */
export const MEASUREMENTS: { name: string; unit: string; two?: [string, string]; step?: number }[] = [
  { name: "Blood pressure", unit: "mmHg", two: ["Systolic", "Diastolic"] },
  { name: "Heart rate", unit: "bpm" },
  { name: "Weight", unit: "kg", step: 0.1 },
  { name: "Blood sugar", unit: "mmol/L", step: 0.1 },
  { name: "Temperature", unit: "°C", step: 0.1 },
  { name: "Oxygen", unit: "%" },
  { name: "Sleep", unit: "hours", step: 0.5 },
];

export const SYMPTOMS = ["Headache", "Nausea", "Tiredness", "Anxiety", "Low mood", "Dizziness", "Pain", "Trouble sleeping", "Restlessness", "Appetite change"];

export const MOODS = [
  { value: 1, label: "Awful" },
  { value: 2, label: "Low" },
  { value: 3, label: "Okay" },
  { value: 4, label: "Good" },
  { value: 5, label: "Great" },
];

export const SEVERITY = ["", "Mild", "Moderate", "Strong", "Severe"];

export function entryText(kind: EntryKind, value: number, value2: number | null, unit: string) {
  if (kind === "mood") return MOODS.find((m) => m.value === value)?.label ?? String(value);
  if (kind === "symptom") return SEVERITY[value] ?? String(value);
  return `${num(value)}${value2 != null ? `/${num(value2)}` : ""} ${unit}`.trim();
}
