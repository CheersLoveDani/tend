import { motion } from "motion/react";
import { useStore } from "../lib/store";
import { WEATHERS, WEATHER_EVENT, todaysWeather, type Weather } from "../lib/weather";
import { sounds } from "../lib/sound";
import { today, ymd } from "../lib/dates";

/** "What's the weather like in you?" Five honest answers, all of them good for the tree. */
export function WeatherCheckIn({ compact, onPicked }: { compact?: boolean; onPicked?: (w: Weather) => void }) {
  const store = useStore();
  const current = todaysWeather(store.snap?.entries ?? []);

  const pick = async (v: Weather) => {
    sounds.tap();
    // Changing your mind later today updates the same check-in (so seeds come once a day).
    const t = today();
    const existing = (store.snap?.entries ?? []).find((e) => e.kind === "mood" && ymd(new Date(e.at)) === t);
    const saved = await store.saveEntry({ id: existing?.id ?? "", kind: "mood", name: "Mood", value: v, value2: null, unit: "", note: "", at: Date.now() });
    if (!saved) return;
    onPicked?.(v);
    // The Garden answers this with its tree; a stormy one may offer a light day (StormyDay).
    window.dispatchEvent(new CustomEvent(WEATHER_EVENT, { detail: v }));
  };

  return (
    <div className={`weather-check ${compact ? "is-compact" : ""}`} role="radiogroup" aria-label="How's the weather in you today?">
      {WEATHERS.map((w) => (
        <motion.button
          key={w.value}
          role="radio"
          aria-checked={current === w.value}
          className={`weather-pick ${current === w.value ? "is-on" : ""}`}
          whileTap={{ scale: 0.9 }}
          onClick={() => void pick(w.value)}
        >
          <span className="weather-icon">{w.icon}</span>
          <span>{w.label}</span>
        </motion.button>
      ))}
    </div>
  );
}
