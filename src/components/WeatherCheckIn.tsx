import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useStore } from "../lib/store";
import { WEATHERS, WEATHER_EVENT, moodEntry, todaysWeather, type Weather } from "../lib/weather";
import { sounds } from "../lib/sound";

/** "What's the weather like in you?" Five honest answers, all of them good for the tree. */
export function WeatherCheckIn({ compact, onPicked }: { compact?: boolean; onPicked?: (w: Weather) => void }) {
  const store = useStore();
  const current = todaysWeather(store.snap?.entries ?? []);

  const pick = async (v: Weather) => {
    const saved = await store.saveEntry(moodEntry(store.snap?.entries ?? [], v));
    if (!saved) return;
    onPicked?.(v);
    // The Garden answers this with its tree; a stormy one may offer a light day (StormyDay).
    window.dispatchEvent(new CustomEvent(WEATHER_EVENT, { detail: v }));
  };

  return <WeatherFaces value={current} compact={compact} reduceMotion={store.reduceMotion} onPick={(v) => void pick(v)} />;
}

/**
 * Five faces. The one you pick turns into its weather, which then moves a little (the sun turns,
 * clouds drift, rain bobs, thunder rumbles). Shared with the desktop's mood pop-up, so it takes its
 * state as props instead of reading the store.
 */
export function WeatherFaces({
  value,
  onPick,
  compact,
  reduceMotion,
}: {
  value: Weather | null;
  onPick: (w: Weather) => void;
  compact?: boolean;
  reduceMotion?: boolean;
}) {
  // Bumped on each pick so the ring plays once, on the face that was just tapped.
  const [burst, setBurst] = useState<{ v: Weather; key: number } | null>(null);
  const still = reduceMotion ? { duration: 0 } : undefined;

  return (
    <div className={`weather-check ${compact ? "is-compact" : ""}`} role="radiogroup" aria-label="How's the weather in you today?">
      {WEATHERS.map((w) => {
        const on = value === w.value;
        return (
          <motion.button
            key={w.value}
            role="radio"
            aria-checked={on}
            aria-label={on ? `${w.feel}: ${w.label}` : w.feel}
            className={`weather-pick wp-${w.value} ${on ? "is-on" : ""}`}
            whileTap={reduceMotion ? undefined : { scale: 0.9 }}
            onClick={() => {
              sounds.tap();
              if (!on) setBurst({ v: w.value, key: Date.now() });
              onPick(w.value);
            }}
          >
            <span className="weather-glyph" aria-hidden>
              <AnimatePresence mode="popLayout" initial={false}>
                {on ? (
                  <motion.span
                    key="sky"
                    className="weather-icon"
                    initial={{ scale: 0.1, rotate: -140, opacity: 0, filter: "blur(6px)" }}
                    animate={{ scale: 1, rotate: 0, opacity: 1, filter: "blur(0px)" }}
                    exit={{ scale: 0.2, opacity: 0, filter: "blur(4px)" }}
                    transition={still ?? { type: "spring", stiffness: 340, damping: 15, delay: 0.12 }}
                  >
                    <span className={`wx-idle wx-${w.value}`}>{w.icon}</span>
                  </motion.span>
                ) : (
                  <motion.span
                    key="face"
                    className="weather-icon weather-face"
                    initial={{ scale: 0.3, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1, filter: "blur(0px)" }}
                    exit={{ scale: [1, 1.25, 0.1], rotate: [0, -12, 160], opacity: [1, 1, 0], filter: ["blur(0px)", "blur(0px)", "blur(6px)"] }}
                    transition={still ?? { duration: 0.32, ease: "easeIn" }}
                  >
                    {w.face}
                  </motion.span>
                )}
              </AnimatePresence>
              {!reduceMotion && burst?.v === w.value && (
                <motion.span
                  key={burst.key}
                  className="weather-burst"
                  initial={{ scale: 0.3, opacity: 0.8 }}
                  animate={{ scale: 1.9, opacity: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut", delay: 0.15 }}
                />
              )}
            </span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={on ? "label" : "feel"}
                className="weather-word"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={still ?? { duration: 0.2, delay: on ? 0.15 : 0 }}
              >
                {on ? w.label : w.feel}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
}
