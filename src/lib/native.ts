// Bridge to the Android plugin: alarms, the persistent "still to do" notification,
// and the unlock screen all run natively from the state we push here.
import { addPluginListener, invoke } from "@tauri-apps/api/core";
import { api, isAndroid, isSomeday, type Reminder, type Snapshot } from "./api";
import { defaultSettings, endOfToday, type Settings } from "./settings";
import { plusDays, today, ymd } from "./dates";
import { amountText } from "./meds";
import { quickAddInput } from "./quickadd";
import { moodEntry, type Weather } from "./weather";

export interface Permissions {
  notifications: boolean;
  exactAlarm: boolean;
  overlay: boolean;
  fullScreenIntent: boolean;
  batteryUnrestricted: boolean;
}

export type PermissionKind = keyof Permissions;

export interface LaunchAction {
  action: "nag" | "open" | "reminder" | "moodWhy" | null;
  reminderId?: string;
}

/**
 * Things done outside the webview (notification buttons, widget, Quick Settings tile, share sheet),
 * queued natively and applied by the store's `applyPending` the next time the UI runs.
 * - complete: finish reminder `id` (or take dose `dose:<slot>`)
 * - step: tick reminder `id`'s next step
 * - tomorrow: move reminder `id` to tomorrow
 * - add: create a reminder from `text` (natural language, e.g. "call mum at 6")
 * - quietToday: turn on "Quiet for today"
 * - mood: a weather check-in from the mood notification; `text` is the value (1–5)
 * - snooze: already handled natively (alarm re-scheduled); informational only
 */
export interface PendingAction {
  type: "complete" | "snooze" | "step" | "tomorrow" | "add" | "quietToday" | "mood";
  id: string;
  at: number;
  text?: string;
}

const P = "plugin:tend-native|";

/** Today's and earlier reminders that are still open, soonest first. */
export function waiting(reminders: Reminder[]): Reminder[] {
  const t = today();
  return reminders
    .filter((r) => r.status === "open" && r.date <= t && !isSomeday(r))
    .sort((a, b) => (a.date + (a.time ?? "99")).localeCompare(b.date + (b.time ?? "99")));
}

function epoch(date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
}

/** Native ids for doses carry this prefix so notification taps know what they are. */
export const DOSE_PREFIX = "dose:";

export async function pushNativeState(snap: Snapshot, s: Settings) {
  if (!isAndroid) return;
  const now = Date.now();
  const t = today();
  // Medication comes first everywhere: the list, the chime and the unlock screen.
  const doses = snap.doses
    .filter((d) => d.status === "due" && !d.extra)
    .map((d) => ({
      id: DOSE_PREFIX + d.id,
      title: `${d.name} (${amountText(d.amount, d.form)})`,
      time: d.time,
      stepsDone: 0,
      stepsTotal: 0,
      reward: 0,
      dose: true,
      critical: d.critical,
      dueAt: d.dueAt,
      chime: true,
    }));
  const pending = [
    ...doses,
    ...waiting(snap.reminders).map((r) => {
      // Only today's timed reminders may chime, and only once their time has come.
      // Untimed and older ones stay in the silent list.
      const dueAt = r.time && r.date === t ? epoch(r.date, r.time) : null;
      return {
        id: r.id,
        title: r.title,
        time: r.time,
        stepsDone: r.steps.filter((x) => x.done).length,
        stepsTotal: r.steps.length,
        reward: r.reward,
        dueAt,
        chime: dueAt !== null && dueAt <= now,
      };
    }),
  ];
  const doseAlarms = snap.doseAlarms.map((d) => ({
    id: DOSE_PREFIX + d.id,
    title: `Time for ${d.name}`,
    body: `${amountText(d.amount, d.form)}. Tap Taken once it's done.`,
    at: d.dueAt,
    dose: true,
    critical: d.critical,
  }));
  const reminderAlarms = snap.reminders
    .filter((r) => r.status === "open" && r.time && !isSomeday(r))
    .map((r) => ({
      id: r.id,
      title: r.title,
      body: r.steps.length
        ? `Next tiny step: ${r.steps.find((x) => !x.done)?.title ?? r.steps[0].title}`
        : `Worth ${r.reward} seeds whenever you're ready`,
      at: epoch(r.date, r.time!),
    }));
  const alarms = [...doseAlarms, ...reminderAlarms].filter((a) => a.at > now).slice(0, 60);
  await invoke(`${P}set_state`, {
    state: {
      pending,
      alarms,
      persistentNotification: s.persistentNotification,
      nagOnUnlock: s.nagOnUnlock,
      // "After each chime" needs chimes; without them fall back to at most every 30 min.
      nagAfterChime: s.nagEvery < 0 && s.chimeMinutes > 0,
      nagCooldownMinutes: s.nagEvery < 0 ? (s.chimeMinutes > 0 ? 0 : 30) : s.nagEvery,
      chimeMinutes: s.chimeMinutes,
      quietHours: s.quietHours,
      pausedUntil: s.pausedUntil && s.pausedUntil > now ? s.pausedUntil : 0,
      nagDailyCap: s.nagDailyCap,
      nudgeAgainMinutes: s.nudgeAgainMinutes,
      doseNagMinutes: s.doseNagMinutes,
      doseNagUntilMinutes: s.doseNagUntilMinutes,
      preWarnMinutes: s.preWarnMinutes,
      cueStyle: s.cueStyle,
      moodTime: s.moodCheckIn,
      moodReasons: s.moodReasons,
      // The day of the last check-in: no need to ask again that day.
      moodLoggedDay: snap.entries.filter((e) => e.kind === "mood").reduce<string | null>((d, e) => {
        const day = ymd(new Date(e.at));
        return d && d > day ? d : day;
      }, null),
    },
  }).catch((e) => console.warn("native state", e));
}

/**
 * Applies actions queued outside the webview (see `PendingAction`). Each one is independent: a
 * reminder that has since been deleted just gets skipped. Returns the new settings when one of
 * them changed settings ("Quiet today"), so the store can pick them up.
 */
export async function applyActions(actions: PendingAction[]): Promise<Settings | null> {
  let settings: Settings | null = null;
  for (const a of actions) {
    try {
      switch (a.type) {
        case "complete":
          if (a.id.startsWith(DOSE_PREFIX)) await api.takeDose(a.id.slice(DOSE_PREFIX.length));
          else await api.complete(a.id);
          break;
        case "step": {
          // Read fresh each time: two step taps in a row tick two different steps.
          const r = (await api.snapshot()).reminders.find((x) => x.id === a.id);
          const next = r?.steps.find((x) => !x.done);
          if (next) await api.toggleStep(a.id, next.id, true);
          else if (r && r.status === "open") await api.complete(a.id);
          break;
        }
        case "tomorrow":
          await api.move(a.id, plusDays(1));
          break;
        case "add": {
          const input = a.text ? quickAddInput(a.text, new Date(a.at)) : null;
          if (input) await api.save(input);
          break;
        }
        case "quietToday": {
          const stored = await api.getSettings().catch(() => ({}));
          const next = { ...defaultSettings, ...stored, pausedUntil: endOfToday(new Date(a.at)) } as Settings;
          await api.setSettings(next);
          settings = next;
          break;
        }
        case "mood": {
          const v = Number(a.text);
          if (!(v >= 1 && v <= 5)) break;
          const entries = (await api.snapshot()).entries;
          await api.saveEntry(moodEntry(entries, v as Weather, a.at));
          break;
        }
        case "snooze":
          // Already re-scheduled natively.
          break;
      }
    } catch (e) {
      console.warn("pending action", a.type, e);
    }
  }
  return settings;
}

export const native = {
  /** Leave to the home screen without closing, like Android's own back. */
  moveToBack: () => (isAndroid ? invoke(`${P}move_to_back`).catch(() => null) : Promise.resolve(null)),
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
    isAndroid
      ? invoke<LaunchAction>(`${P}take_launch_action`)
      : // Browser preview: ?nag opens the unlock screen.
        Promise.resolve<LaunchAction>({ action: "__TEND_MOCK_FIT__" in window && new URLSearchParams(location.search).has("nag") ? "nag" : null }),
  takePendingActions: async () =>
    isAndroid ? (await invoke<{ actions: PendingAction[] }>(`${P}take_pending_actions`)).actions : [],
  onAction: (cb: (a: LaunchAction) => void) =>
    isAndroid ? addPluginListener("tend-native", "action", cb) : Promise.resolve(null),
  onPendingActions: (cb: () => void) =>
    isAndroid ? addPluginListener("tend-native", "pending-actions", cb) : Promise.resolve(null),
};
