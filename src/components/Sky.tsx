import type { ReactNode } from "react";
import type { Weather } from "../lib/weather";

interface Props {
  weather: Weather | null;
  children: ReactNode;
  /** Smaller sky for the sidebar tree. */
  compact?: boolean;
}

// Fixed pseudo-random spread so the rain looks natural but never jumps between renders.
const DROPS = Array.from({ length: 36 }, (_, i) => ({
  left: (i * 37.3) % 100,
  delay: ((i * 0.173) % 1).toFixed(2),
  speed: (0.75 + ((i * 0.29) % 0.45)).toFixed(2),
  len: 10 + ((i * 7) % 9),
}));

const CLOUDS: Record<Weather, { x: number; y: number; s: number }[]> = {
  1: [{ x: 6, y: 4, s: 1.15 }, { x: 40, y: 0, s: 1.3 }, { x: 70, y: 6, s: 1.1 }],
  2: [{ x: 12, y: 6, s: 1 }, { x: 58, y: 2, s: 1.15 }],
  3: [{ x: 8, y: 10, s: 0.95 }, { x: 52, y: 4, s: 1.05 }],
  4: [{ x: 14, y: 12, s: 0.8 }],
  5: [],
};

/** The tree's weather: rain for low days, sun for bright ones. Both help it grow. */
export function Sky({ weather, children, compact }: Props) {
  const drops = weather === 1 ? DROPS.length : weather === 2 ? 14 : 0;
  return (
    <div className={`sky ${compact ? "is-compact" : ""} ${weather ? `sky-${weather}` : "sky-none"}`}>
      <div className="sky-glow" aria-hidden />
      <div className="sky-sun" aria-hidden>
        <span className="sky-rays" />
      </div>
      {weather &&
        CLOUDS[weather].map((c, i) => (
          <span key={`${weather}-${i}`} className="sky-cloud" aria-hidden style={{ left: `${c.x}%`, top: `${c.y}%`, ["--s" as string]: c.s, animationDelay: `${-i * 7}s` }} />
        ))}
      <div className="sky-tree">{children}</div>
      {drops > 0 && (
        <div className="sky-rain" aria-hidden>
          {DROPS.slice(0, drops).map((d, i) => (
            <span key={i} style={{ left: `${d.left}%`, height: d.len, animationDelay: `${d.delay}s`, animationDuration: `${d.speed}s` }} />
          ))}
        </div>
      )}
    </div>
  );
}
