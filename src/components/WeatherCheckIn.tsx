import { motion } from "motion/react";
import { useStore } from "../lib/store";
import { WEATHERS, todaysWeather, type Weather } from "../lib/weather";
import { sounds } from "../lib/sound";

/** "What's the weather like in you?" Five honest answers, all of them good for the tree. */
export function WeatherCheckIn({ compact }: { compact?: boolean }) {
  const store = useStore();
  const current = todaysWeather(store.snap?.entries ?? []);

  const pick = (v: Weather) => {
    sounds.tap();
    void store.saveEntry({ id: "", kind: "mood", name: "Mood", value: v, value2: null, unit: "", note: "", at: Date.now() });
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
          onClick={() => pick(w.value)}
        >
          <span className="weather-icon">{w.icon}</span>
          <span>{w.label}</span>
        </motion.button>
      ))}
    </div>
  );
}
