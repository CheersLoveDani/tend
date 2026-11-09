import { useEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { AnimatePresence, motion } from "motion/react";
import { api, type Entry, type MoodReason } from "../lib/api";
import { ReasonsPanel } from "../components/MoodReasons";
import { defaultSettings, type Settings } from "../lib/settings";
import { moodEntry, todaysMoodEntry, todaysWeather, weatherOf, type Weather } from "../lib/weather";
import { WeatherFaces } from "../components/WeatherCheckIn";
import { Close } from "../components/Icons";

const win = () => {
  try {
    return getCurrentWindow();
  } catch {
    return null; // browser preview
  }
};

/** Long enough to watch the face turn into weather before the window tucks itself away. */
const LINGER_MS = 2200;
/** The window's size: just the faces, or with "what's behind it" open. */
const SMALL = { w: 440, h: 200 };
const TALL = { w: 440, h: 430 };

/**
 * The desktop's daily weather check-in (index.html?mood=1), opened by the scheduler at the time
 * set in Settings. Runs without the main store, like quick add.
 */
export function MoodPop() {
  const [value, setValue] = useState<Weather | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [asking, setAsking] = useState(false);
  const resize = (s: { w: number; h: number }) => void win()?.setSize(new LogicalSize(s.w, s.h)).catch(() => null);
  const closing = useRef<number | undefined>(undefined);

  const hide = () => {
    window.clearTimeout(closing.current);
    void win()?.hide().catch(() => null);
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-mood", "");
    const load = async () => {
      window.clearTimeout(closing.current);
      const s = { ...defaultSettings, ...(await api.getSettings().catch(() => ({}))) } as Settings;
      setSettings(s);
      setAsking(false);
      resize(SMALL);
      if (s.theme === "system") document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", s.theme);
      setReduceMotion(s.reduceMotion === "on" || (s.reduceMotion === "system" && matchMedia("(prefers-reduced-motion: reduce)").matches));
      const snap = await api.snapshot().catch(() => null);
      setValue(snap ? todaysWeather(snap.entries) : null);
    };
    // First draw, then show: no blank flash.
    void load().then(() => win()?.show().catch(() => null));
    const off = listen("mood-shown", () => void load()).catch(() => null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("keydown", esc);
    return () => {
      void off.then((f) => f?.());
      window.removeEventListener("keydown", esc);
    };
  }, []);

  async function pick(v: Weather) {
    setValue(v);
    try {
      const snap = await api.snapshot();
      await api.saveEntry(moodEntry(snap.entries, v));
      setEntry(todaysMoodEntry((await api.snapshot()).entries));
      void emit("data-changed").catch(() => null);
    } catch (e) {
      console.error(e);
    }
    window.clearTimeout(closing.current);
    if (settings.moodReasons) {
      // Stay open for "what's behind it"; the window grows to fit.
      setAsking(true);
      resize(TALL);
    } else {
      closing.current = window.setTimeout(hide, LINGER_MS);
    }
  }

  async function saveReasons(reasons: MoodReason[]) {
    try {
      const latest = todaysMoodEntry((await api.snapshot()).entries) ?? entry;
      if (!latest) return;
      await api.saveEntry({ ...latest, reasons });
      setEntry({ ...latest, reasons });
      void emit("data-changed").catch(() => null);
    } catch (e) {
      console.error(e);
    }
  }

  function addOption(r: MoodReason) {
    const next = { ...settings, moodReasonOptions: [...settings.moodReasonOptions, r] };
    setSettings(next);
    // Merge into what's saved now, in case the main window changed something meanwhile.
    void api
      .getSettings()
      .then((cur) => api.setSettings({ ...defaultSettings, ...cur, moodReasonOptions: next.moodReasonOptions }))
      .then(() => emit("settings-changed"))
      .catch(() => null);
  }

  return (
    <div className="mood-pop">
      <p className="mood-pop-title">
        How's the weather in you?
        <small>{weatherOf(value)?.line ?? "Rain and sun both help the tree grow."}</small>
      </p>
      <WeatherFaces value={value} reduceMotion={reduceMotion} onPick={(v) => void pick(v)} />
      <AnimatePresence>
        {asking && entry && (
          <motion.div
            key="why"
            className="mood-pop-why"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: reduceMotion ? 0 : 0.3 }}
          >
            <ReasonsPanel
              entry={entry}
              options={settings.moodReasonOptions}
              useModel={settings.useModel}
              reduceMotion={reduceMotion}
              onSave={(r) => void saveReasons(r)}
              onAddOption={addOption}
            />
            <button className="btn btn-primary btn-small mood-pop-done" onClick={hide}>
              Done
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <button className="btn btn-quiet btn-icon mood-pop-close" onClick={hide} aria-label="Close">
        <Close size={16} />
      </button>
    </div>
  );
}
