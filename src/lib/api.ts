import { invoke } from "@tauri-apps/api/core";

export interface Step {
  id: string;
  title: string;
  done: boolean;
}

/** A reminder that's a workout: ticks itself off when Health Connect sees a matching one. */
export interface Exercise {
  /** Health Connect exercise types that count; empty means any workout. */
  types: number[];
  minutes: number;
}

export interface Reminder {
  id: string;
  seriesId: string;
  title: string;
  notes: string;
  date: string;
  time: string | null;
  steps: Step[];
  reward: number;
  suggested: number | null;
  status: "open" | "done";
  repeat: Repeat | null;
  bits: number;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
  device: string;
  deleted: boolean;
  exercise?: Exercise | null;
}

export type Repeat = "daily" | "weekdays" | "weekly" | "monthly";

export interface ReminderInput {
  id?: string | null;
  title: string;
  notes: string;
  date: string;
  time: string | null;
  steps: Step[];
  reward: number;
  suggested: number | null;
  repeat: Repeat | null;
  exercise?: Exercise | null;
}

export interface LevelInfo {
  level: number;
  xp: number;
  intoLevel: number;
  levelSize: number;
  stage: string;
}

export interface RewardEvent {
  kind: "step" | "bit" | "finish" | "undo" | "none";
  gained: number;
  bonus: number;
  remaining: number;
  before: LevelInfo;
  after: LevelInfo;
  reminder: Reminder;
}

export interface DayStat {
  date: string;
  seeds: number;
  done: number;
}

export interface Snapshot {
  reminders: Reminder[];
  level: LevelInfo;
  days: DayStat[];
  deviceId: string;
  meds: MedView[];
  /** Today's doses, soonest first. */
  doses: DoseSlot[];
  /** Untaken doses over the next week, for alarms. */
  doseAlarms: DoseSlot[];
  /** Health diary for the last 90 days, newest first. */
  entries: Entry[];
}

export type ScheduleKind = "daily" | "interval" | "weekdays" | "cycle" | "asNeeded";

export interface DoseTime {
  time: string;
  amount: number;
}

export interface Schedule {
  kind: ScheduleKind;
  every: number;
  /** 0 = Monday */
  days: number[];
  onDays: number;
  offDays: number;
  times: DoseTime[];
}

export interface Med {
  id: string;
  name: string;
  strength: string;
  form: string;
  icon: string;
  color: string;
  notes: string;
  schedule: Schedule;
  startDate: string;
  endDate: string | null;
  stock: number | null;
  stockAt: number;
  refillAt: number | null;
  paused: boolean;
  critical: boolean;
  reward: number;
  createdAt: number;
}

export interface MedView extends Med {
  left: number | null;
  daysLeft: number | null;
  low: boolean;
}

export type MedInput = Omit<Med, "id" | "stockAt" | "createdAt"> & { id: string | null };

export interface DoseSlot {
  id: string;
  medId: string;
  name: string;
  date: string;
  time: string;
  amount: number;
  form: string;
  status: "upcoming" | "due" | "taken" | "skipped";
  dueAt: number;
  loggedAt: number | null;
  critical: boolean;
  extra: boolean;
}

export interface DayAdherence {
  date: string;
  scheduled: number;
  taken: number;
  skipped: number;
}

export type EntryKind = "measurement" | "symptom" | "mood";

export interface Entry {
  id: string;
  kind: EntryKind;
  name: string;
  value: number;
  value2: number | null;
  unit: string;
  note: string;
  at: number;
}

export interface Suggestion {
  reward: number;
  effort: number;
  source: "llm" | "heuristic" | "memory";
  millis: number;
  reason: string;
}

export interface StepIdea {
  steps: string[];
  from: string;
  source: "yours" | "library";
  similarity: number;
}

export interface Peer {
  id: string;
  name: string;
  host: string;
  port: number;
  lastSync: number | null;
  isClient: boolean;
}

export interface SyncInfo {
  deviceId: string;
  name: string;
  hosting: boolean;
  code: string;
  port: number;
  addresses: string[];
  peers: Peer[];
}

export interface Hello {
  deviceId: string;
  name: string;
  host: string;
  port: number;
}

export interface SyncOutcome {
  peers: number;
  ok: number;
  changed: number;
  errors: string[];
}

export const api = {
  snapshot: () => invoke<Snapshot>("snapshot"),
  save: (input: ReminderInput) => invoke<Reminder>("save_reminder", { input }),
  remove: (id: string) => invoke<void>("delete_reminder", { id }),
  move: (id: string, date: string) => invoke<Reminder>("move_reminder", { id, date }),
  toggleStep: (id: string, stepId: string, done: boolean) =>
    invoke<RewardEvent>("toggle_step", { id, stepId, done }),
  didABit: (id: string) => invoke<RewardEvent>("did_a_bit", { id }),
  complete: (id: string) => invoke<RewardEvent>("complete_reminder", { id }),
  reopen: (id: string) => invoke<RewardEvent>("reopen_reminder", { id }),
  getSettings: () => invoke<Record<string, unknown>>("get_settings"),
  setSettings: (settings: unknown) => invoke<void>("set_settings", { settings }),
  suggest: (title: string, notes: string, steps: string[], useModel: boolean) =>
    invoke<Suggestion>("suggest_reward", { title, notes, steps, useModel }),
  suggestSteps: (title: string) => invoke<StepIdea[]>("suggest_steps", { title }),
  modelStatus: () => invoke<{ present: boolean; size: number }>("model_status"),
  downloadModel: () => invoke<void>("download_model"),
  deleteModel: () => invoke<void>("delete_model"),
  syncInfo: () => invoke<SyncInfo>("sync_info"),
  openPairing: () => invoke<void>("open_pairing"),
  discover: () => invoke<Hello[]>("discover_hosts"),
  pair: (host: string, port: number | null, code: string) =>
    invoke<Peer>("pair_with", { host, port, code }),
  pairAny: (hosts: string[], port: number, code: string, device: string | null) =>
    invoke<Peer>("pair_any", { hosts, port, code, device }),
  forgetPeer: (id: string) => invoke<void>("forget_peer", { id }),
  syncNow: () => invoke<SyncOutcome>("sync_now"),
  /** Moves several reminders at once (use SOMEDAY to park them). */
  moveMany: (ids: string[], date: string) => invoke<number>("move_reminders", { ids, date }),
  saveMed: (input: MedInput) => invoke<Med>("save_med", { input }),
  deleteMed: (id: string) => invoke<void>("delete_med", { id }),
  addMedStock: (id: string, amount: number) => invoke<Med>("add_med_stock", { id, amount }),
  takeDose: (id: string) => invoke<RewardEvent>("take_dose", { id }),
  takeExtraDose: (medId: string, amount: number) => invoke<RewardEvent>("take_extra_dose", { medId, amount }),
  skipDose: (id: string) => invoke<RewardEvent>("skip_dose", { id }),
  undoDose: (id: string) => invoke<RewardEvent>("undo_dose", { id }),
  medHistory: (id: string, days: number) => invoke<DayAdherence[]>("med_history", { id, days }),
  saveEntry: (entry: Entry) => invoke<RewardEvent>("save_entry", { entry }),
  deleteEntry: (id: string) => invoke<void>("delete_entry", { id }),
  exportHealth: () => invoke<string>("export_health"),
  importHealth: (json: string) => invoke<[number, number, number]>("import_health", { json }),
};

/** Reminders parked with no day ("Someday") carry this date, so older versions just see a far-future task. */
export const SOMEDAY = "9999-12-31";
export const isSomeday = (r: Pick<Reminder, "date">) => r.date === SOMEDAY;

export const uid = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 12);

export const isAndroid = /android/i.test(navigator.userAgent);
