import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, SOMEDAY, type DoseSlot, type Entry, type Med, type MedInput, type Reminder, type ReminderInput, type RewardEvent, type Snapshot } from "./api";
import { defaultSettings, endOfToday, isPaused, type Settings } from "./settings";
import { configureSound, sounds } from "./sound";
import { DOSE_PREFIX, native, pushNativeState } from "./native";
import { dayName, today, tomorrow } from "./dates";
import { autoBackup } from "./backup";
import { earnedText, fitness, fitSupported, type FitData } from "./fitness";

export type Toast = { id: number; text: string; undo?: () => void };

/** How long a toast stays: long enough to read and reach Undo (WCAG 2.2.1), paused while hovered or focused. */
export const toastMs = (t: Toast) => (t.undo ? 10_000 : 4_000);

/** Turns whatever went wrong (often a raw Rust or IPC string) into a calm sentence. */
export function friendlyError(e: unknown): string {
  const raw = (e instanceof Error ? e.message : String(e ?? "")).trim();
  const low = raw.toLowerCase();
  if (!raw) return "That didn't work. Nothing was lost, so try again in a moment.";
  if (/database is locked|\bbusy\b/.test(low)) return "Tend was busy for a second. Try that again.";
  if (/command .* not found|unknown command|not implemented/.test(low)) return "This version of Tend can't do that yet.";
  if (/not found|no rows|query returned no/.test(low)) return "That item has changed, maybe on another device. Have another look.";
  if (/network|connection|timed out|timeout|unreachable|offline|dns/.test(low)) return "Couldn't reach the other device or the internet. It'll try again later.";
  if (/permission|denied|not allowed/.test(low)) return "Tend doesn't have permission for that yet. You can allow it in Settings.";
  // Short messages written for people (Rust's own user-facing errors) pass through as they are.
  if (raw.length <= 90 && !/::|panicked|\.rs:|\{|\}|Error\(/.test(raw)) return raw.replace(/^error:\s*/i, "");
  return "Something went wrong there. Nothing was lost, so try again in a moment.";
}

/** A friendly "where it went" for a date, for move toasts. */
export function movedText(title: string, date: string): string {
  if (date === SOMEDAY) return `"${title}" is resting in Someday, in Coming up whenever you want it.`;
  if (date === today()) return `"${title}" is back on today.`;
  if (date === tomorrow()) return `Moved "${title}" to tomorrow.`;
  return `Moved "${title}" to ${dayName(date)}.`;
}

interface Store {
  snap: Snapshot | null;
  settings: Settings;
  rewards: RewardEvent[];
  toasts: Toast[];
  reduceMotion: boolean;
  nag: boolean;
  /** Recent steps and workouts, when Health Connect is connected. */
  fit: FitData | null;
  /** Reads Health Connect and pays any new seeds. Throttled unless `force`. */
  syncFit: (force?: boolean) => Promise<void>;
  setNag: (v: boolean) => void;
  consumeReward: () => void;
  refresh: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => void;
  save: (input: ReminderInput) => Promise<Reminder | null>;
  toggleStep: (r: Reminder, stepId: string, done: boolean) => Promise<void>;
  didABit: (r: Reminder) => Promise<void>;
  complete: (r: Reminder) => Promise<void>;
  reopen: (r: Reminder) => Promise<void>;
  notToday: (r: Reminder) => Promise<void>;
  moveTo: (r: Reminder, date: string) => Promise<void>;
  /** Moves several at once (Someday, tomorrow, back to today) with one undo toast. */
  moveMany: (rs: Reminder[], date: string, text: string) => Promise<void>;
  /** "Quiet for today": no chimes, nudges or unlock screen until midnight. Doses still remind. */
  quietToday: () => void;
  resumeNudges: () => void;
  dismissToast: (id: number) => void;
  remove: (r: Reminder) => Promise<void>;
  toast: (text: string, undo?: () => void) => void;
  saveMed: (input: MedInput) => Promise<Med | null>;
  deleteMed: (m: Med) => Promise<void>;
  addStock: (m: Med, amount: number) => Promise<void>;
  takeDose: (d: DoseSlot) => Promise<void>;
  takeExtra: (m: Med, amount: number) => Promise<void>;
  skipDose: (d: DoseSlot) => Promise<void>;
  undoDose: (d: DoseSlot) => Promise<void>;
  saveEntry: (e: Entry) => Promise<boolean>;
  deleteEntry: (e: Entry) => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("store missing");
  return s;
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [rewards, setRewards] = useState<RewardEvent[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [nag, setNag] = useState(false);
  const [fit, setFit] = useState<FitData | null>(null);
  const fitAt = useRef(0);
  const [systemReduce, setSystemReduce] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const toast = useCallback((text: string, undo?: () => void) => {
    const id = Date.now() + Math.random();
    // Each toast times itself out (Toasts in App.tsx), so hovering or focusing one can hold it.
    setToasts((t) => [...t.slice(-2), { id, text, undo }]);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const refresh = useCallback(async () => {
    try {
      const s = await api.snapshot();
      setSnap(s);
      void pushNativeState(s, settingsRef.current);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fail = useCallback(
    (e: unknown) => {
      console.error(e);
      toast(friendlyError(e));
    },
    [toast],
  );

  const reward = useCallback(
    (e: RewardEvent) => {
      if (e.kind === "none") return;
      if (e.kind === "undo") sounds.undo();
      else setRewards((q) => [...q, e]);
    },
    [],
  );

  const syncFit = useCallback(
    async (force = false) => {
      const since = settingsRef.current.fitSince;
      if (!fitSupported() || !since) return setFit(null);
      if (!force && Date.now() - fitAt.current < 60_000) return;
      fitAt.current = Date.now();
      try {
        const st = await fitness.status();
        if (st.status !== "available" || (!st.steps && !st.workouts)) return setFit(null);
        const data = await fitness.read(7);
        const r = await fitness.award(settingsRef.current, data.days, data.workouts);
        setFit({ ...data, counted: r.counted });
        if (r.event.gained > 0) {
          reward(r.event);
          toast(earnedText(r));
        }
        // Exercise tasks a workout just ticked off get the full finish celebration.
        for (const e of r.completed) reward(e);
        if (r.event.gained > 0 || r.completed.length) await refresh();
      } catch (e) {
        console.warn("fitness", e);
      }
    },
    [reward, refresh, toast],
  );

  // Apply "Done" / "Snooze" taps made on Android notifications while we weren't running.
  const applyPending = useCallback(async () => {
    const actions = await native.takePendingActions().catch(() => []);
    for (const a of actions) {
      if (a.type !== "complete") continue;
      if (a.id.startsWith(DOSE_PREFIX)) await api.takeDose(a.id.slice(DOSE_PREFIX.length)).catch(() => null);
      else await api.complete(a.id).catch(() => null);
    }
    if (actions.length) await refresh();
  }, [refresh]);

  useEffect(() => {
    (async () => {
      const stored = await api.getSettings().catch(() => ({}));
      const merged = { ...defaultSettings, ...stored } as Settings;
      setSettings(merged);
      settingsRef.current = merged;
      // TODO(merge): pass muted: settings.mutedSounds
      configureSound({ enabled: merged.sound, volume: merged.volume });
      await applyPending();
      await refresh();
      void syncFit(true);
      const launch = await native.takeLaunchAction().catch(() => ({ action: null }));
      if (launch.action === "nag" && !isPaused(merged)) setNag(true);
      void api.syncNow().catch(() => null);
      void autoBackup();
    })();
    const unlisten = listen("data-changed", () => void refresh());
    const actionSub = native.onAction((a) => {
      if (a.action === "nag" && !isPaused(settingsRef.current)) setNag(true);
      void refresh();
    });
    const pendingSub = native.onPendingActions(() => void applyPending());
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void applyPending();
        void syncFit();
        void api.syncNow().then(() => refresh()).catch(() => null);
        void autoBackup();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    // Re-render once a minute so "this afternoon" labels stay true.
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") setSnap((s) => (s ? { ...s } : s));
    }, 60_000);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMq = () => setSystemReduce(mq.matches);
    mq.addEventListener("change", onMq);
    return () => {
      void unlisten.then((f) => f());
      void actionSub.then((s) => s?.unregister());
      void pendingSub.then((s) => s?.unregister());
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(tick);
      mq.removeEventListener("change", onMq);
    };
  }, [refresh, applyPending, syncFit]);

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        settingsRef.current = next;
        // TODO(merge): pass muted: settings.mutedSounds
        configureSound({ enabled: next.sound, volume: next.volume });
        void api.setSettings(next);
        if (snap) void pushNativeState(snap, next);
        return next;
      });
    },
    [snap],
  );

  const run = useCallback(
    async (p: Promise<RewardEvent>) => {
      try {
        const e = await p;
        reward(e);
        await refresh();
      } catch (e) {
        fail(e);
      }
    },
    [reward, refresh, fail],
  );

  const store = useMemo<Store>(() => {
    const reduceMotion =
      settings.reduceMotion === "on" || (settings.reduceMotion === "system" && systemReduce);
    return {
      snap,
      settings,
      rewards,
      toasts,
      reduceMotion,
      nag,
      fit,
      syncFit,
      setNag,
      consumeReward: () => setRewards((q) => q.slice(1)),
      refresh,
      updateSettings,
      toast,
      dismissToast,
      quietToday: () => {
        updateSettings({ pausedUntil: endOfToday() });
        toast("Quiet until tomorrow. Medicine will still remind you.", () => updateSettings({ pausedUntil: null }));
      },
      resumeNudges: () => updateSettings({ pausedUntil: null }),
      save: async (input) => {
        try {
          const r = await api.save(input);
          await refresh();
          return r;
        } catch (e) {
          fail(e);
          return null;
        }
      },
      toggleStep: (r, stepId, done) => run(api.toggleStep(r.id, stepId, done)),
      didABit: (r) => run(api.didABit(r.id)),
      complete: (r) => run(api.complete(r.id)),
      reopen: (r) => run(api.reopen(r.id)),
      notToday: async (r) => {
        const from = r.date;
        try {
          await api.move(r.id, tomorrow());
          sounds.tap();
          await refresh();
          toast(`Moved "${r.title}" to tomorrow.`, () => void api.move(r.id, from).then(refresh));
        } catch (e) {
          fail(e);
        }
      },
      moveTo: async (r, date) => {
        const from = r.date;
        if (from === date) return;
        try {
          await api.move(r.id, date);
          sounds.tap();
          await refresh();
          toast(movedText(r.title, date), () => void api.move(r.id, from).then(refresh));
        } catch (e) {
          fail(e);
        }
      },
      moveMany: async (rs, date, text) => {
        if (!rs.length) return;
        try {
          await api.moveMany(
            rs.map((r) => r.id),
            date,
          );
          sounds.tap();
          await refresh();
          // Undo puts each one back on its own day.
          const byDate = new Map<string, string[]>();
          for (const r of rs) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r.id]);
          toast(text, () =>
            void Promise.all([...byDate].map(([d, ids]) => api.moveMany(ids, d)))
              .then(refresh)
              .catch(fail),
          );
        } catch (e) {
          fail(e);
        }
      },
      saveMed: async (input) => {
        try {
          const m = await api.saveMed(input);
          await refresh();
          return m;
        } catch (e) {
          fail(e);
          return null;
        }
      },
      deleteMed: async (m) => {
        try {
          await api.deleteMed(m.id);
          await refresh();
          toast(`Removed ${m.name}. Its history stays.`);
        } catch (e) {
          fail(e);
        }
      },
      addStock: async (m, amount) => {
        try {
          await api.addMedStock(m.id, amount);
          sounds.tap();
          await refresh();
        } catch (e) {
          fail(e);
        }
      },
      takeDose: (d) => run(api.takeDose(d.id)),
      takeExtra: (m, amount) => run(api.takeExtraDose(m.id, amount)),
      skipDose: async (d) => {
        try {
          await api.skipDose(d.id);
          sounds.tap();
          await refresh();
          toast(`Skipped ${d.name}`, () => void api.undoDose(d.id).then(refresh));
        } catch (e) {
          fail(e);
        }
      },
      undoDose: (d) => run(api.undoDose(d.id)),
      saveEntry: async (e) => {
        try {
          reward(await api.saveEntry(e));
          await refresh();
          return true;
        } catch (err) {
          fail(err);
          return false;
        }
      },
      deleteEntry: async (e) => {
        try {
          await api.deleteEntry(e.id);
          await refresh();
          toast(`Removed ${e.name}`, () => void api.saveEntry(e).then(refresh));
        } catch (err) {
          fail(err);
        }
      },
      remove: async (r) => {
        try {
          await api.remove(r.id);
          await refresh();
          toast(`Removed "${r.title}"`, () =>
            void api
              .save({ ...r, id: r.id })
              .then(() => refresh()),
          );
        } catch (e) {
          fail(e);
        }
      },
    };
  }, [snap, settings, rewards, toasts, nag, fit, syncFit, systemReduce, refresh, updateSettings, toast, dismissToast, fail, run, reward]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
