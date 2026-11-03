import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, type DoseSlot, type Entry, type Med, type MedInput, type Reminder, type ReminderInput, type RewardEvent, type Snapshot } from "./api";
import { defaultSettings, type Settings } from "./settings";
import { configureSound, sounds } from "./sound";
import { DOSE_PREFIX, native, pushNativeState } from "./native";
import { tomorrow } from "./dates";
import { autoBackup } from "./backup";
import { earnedText, fitness, fitSupported, type FitData } from "./fitness";

export type Toast = { id: number; text: string; undo?: () => void };

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
    setToasts((t) => [...t.slice(-2), { id, text, undo }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), undo ? 6000 : 3200);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await api.snapshot();
      setSnap(s);
      void pushNativeState(s, settingsRef.current);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fail = useCallback((e: unknown) => toast(String(e)), [toast]);

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
      configureSound({ enabled: merged.sound, volume: merged.volume });
      await applyPending();
      await refresh();
      void syncFit(true);
      const launch = await native.takeLaunchAction().catch(() => ({ action: null }));
      if (launch.action === "nag") setNag(true);
      void api.syncNow().catch(() => null);
      void autoBackup();
    })();
    const unlisten = listen("data-changed", () => void refresh());
    const actionSub = native.onAction((a) => {
      if (a.action === "nag") setNag(true);
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
          toast(`"${r.title}" is resting until tomorrow`, () =>
            void api.move(r.id, from).then(refresh),
          );
        } catch (e) {
          fail(e);
        }
      },
      moveTo: async (r, date) => {
        try {
          await api.move(r.id, date);
          await refresh();
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
  }, [snap, settings, rewards, toasts, nag, fit, syncFit, systemReduce, refresh, updateSettings, toast, fail, run, reward]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
