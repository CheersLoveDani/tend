// Bridge to the Android plugin: alarms, the persistent "still to do" notification,
// and the unlock screen all run natively from the state we push here.
import { addPluginListener, invoke } from "@tauri-apps/api/core";
import { isAndroid, type Reminder } from "./api";
import type { Settings } from "./settings";
import { today } from "./dates";

export interface Permissions {
  notifications: boolean;
  exactAlarm: boolean;
  overlay: boolean;
  fullScreenIntent: boolean;
  batteryUnrestricted: boolean;
}

export type PermissionKind = keyof Permissions;

export interface LaunchAction {
  action: "nag" | "open" | "reminder" | null;
  reminderId?: string;
}

export interface PendingAction {
  type: "complete" | "snooze";
  id: string;
  at: number;
}

const P = "plugin:tend-native|";

/** Today's and earlier reminders that are still open, soonest first. */
export function waiting(reminders: Reminder[]): Reminder[] {
  const t = today();
  return reminders
    .filter((r) => r.status === "open" && r.date <= t)
    .sort((a, b) => (a.date + (a.time ?? "99")).localeCompare(b.date + (b.time ?? "99")));
}

function epoch(date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
}

export async function pushNativeState(reminders: Reminder[], s: Settings) {
  if (!isAndroid) return;
  const now = Date.now();
  const pending = waiting(reminders).map((r) => ({
    id: r.id,
    title: r.title,
    time: r.time,
    stepsDone: r.steps.filter((x) => x.done).length,
    stepsTotal: r.steps.length,
    reward: r.reward,
  }));
  const alarms = reminders
    .filter((r) => r.status === "open" && r.time)
    .map((r) => ({
      id: r.id,
      title: r.title,
      body: r.steps.length
        ? `Next tiny step: ${r.steps.find((x) => !x.done)?.title ?? r.steps[0].title}`
        : `Worth ${r.reward} seeds whenever you're ready`,
      at: epoch(r.date, r.time!),
    }))
    .filter((a) => a.at > now)
    .slice(0, 50);
  await invoke(`${P}set_state`, {
    state: {
      pending,
      alarms,
      persistentNotification: s.persistentNotification,
      nagOnUnlock: s.nagOnUnlock,
      nagCooldownMinutes: s.nagCooldownMinutes,
      quietHours: s.quietHours,
    },
  }).catch((e) => console.warn("native state", e));
}

export const native = {
  permissions: () =>
    isAndroid
      ? invoke<Permissions>(`${P}get_permissions`)
      : Promise.resolve<Permissions>({
          notifications: true,
          exactAlarm: true,
          overlay: true,
          fullScreenIntent: true,
          batteryUnrestricted: true,
        }),
  request: (kind: PermissionKind) => invoke<Permissions>(`${P}request_permission`, { kind }),
  takeLaunchAction: () =>
    isAndroid ? invoke<LaunchAction>(`${P}take_launch_action`) : Promise.resolve<LaunchAction>({ action: null }),
  takePendingActions: async () =>
    isAndroid ? (await invoke<{ actions: PendingAction[] }>(`${P}take_pending_actions`)).actions : [],
  onAction: (cb: (a: LaunchAction) => void) =>
    isAndroid ? addPluginListener("tend-native", "action", cb) : Promise.resolve(null),
  onPendingActions: (cb: () => void) =>
    isAndroid ? addPluginListener("tend-native", "pending-actions", cb) : Promise.resolve(null),
};
