import { useEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "../lib/api";
import { defaultSettings, type Settings } from "../lib/settings";
import { moodEntry, todaysWeather, weatherOf, type Weather } from "../lib/weather";
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

/**
 * The desktop's daily weather check-in (index.html?mood=1), opened by the scheduler at the time
 * set in Settings. Runs without the main store, like quick add.
 */
export function MoodPop() {
  const [value, setValue] = useState<Weather | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
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
      void emit("data-changed").catch(() => null);
    } catch (e) {
      console.error(e);
    }
    window.clearTimeout(closing.current);
    closing.current = window.setTimeout(hide, LINGER_MS);
  }

  return (
    <div className="mood-pop">
      <p className="mood-pop-title">
        How's the weather in you?
        <small>{weatherOf(value)?.line ?? "Rain and sun both help the tree grow."}</small>
      </p>
      <WeatherFaces value={value} reduceMotion={reduceMotion} onPick={(v) => void pick(v)} />
      <button className="btn btn-quiet btn-icon mood-pop-close" onClick={hide} aria-label="Close">
        <Close size={16} />
      </button>
    </div>
  );
}
