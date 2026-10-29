import { invoke } from "@tauri-apps/api/core";

export interface Step {
  id: string;
  title: string;
  done: boolean;
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
  discover: () => invoke<Hello[]>("discover_hosts"),
  pair: (host: string, port: number | null, code: string) =>
    invoke<Peer>("pair_with", { host, port, code }),
  pairAny: (hosts: string[], port: number, code: string, device: string | null) =>
    invoke<Peer>("pair_any", { hosts, port, code, device }),
  forgetPeer: (id: string) => invoke<void>("forget_peer", { id }),
  syncNow: () => invoke<SyncOutcome>("sync_now"),
};

export const uid = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 12);

export const isAndroid = /android/i.test(navigator.userAgent);
