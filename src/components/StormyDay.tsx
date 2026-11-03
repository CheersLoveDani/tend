import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Reminder } from "../lib/api";
import { useStore } from "../lib/store";
import { waiting } from "../lib/native";
import { clock, dayName, today, tomorrow } from "../lib/dates";
import { WEATHER_EVENT, type Weather } from "../lib/weather";
import { useBackClose } from "../lib/backStack";

const OFFERED_KEY = "tend.stormy.offered";

const offeredToday = () => {
  try {
    return localStorage.getItem(OFFERED_KEY) === today();
  } catch {
    return false;
  }
};
const markOffered = () => {
  try {
    localStorage.setItem(OFFERED_KEY, today());
  } catch {
    /* fine: at worst it's offered again on another stormy check-in */
  }
};

/**
 * A stormy check-in gently offers a light day: pick one thing, the rest rest until tomorrow.
 * Only ever offered, once a day at most, and never for doses. Settings can turn it off.
 */
export function StormyDay() {
  const store = useStore();
  const [offer, setOffer] = useState<Reminder[] | null>(null);
  const latest = useRef(store);
  latest.current = store;

  useEffect(() => {
    let timer: number | undefined;
    const on = (e: Event) => {
      const w = (e as CustomEvent<Weather>).detail;
      const s = latest.current;
      if (w !== 1 || !s.settings.stormyLightDay || offeredToday()) return;
      const open = waiting(s.snap?.reminders ?? []);
      // With one thing or none there's nothing to lighten.
      if (open.length < 2) return;
      window.clearTimeout(timer);
      // Let the check-in's own response land first.
      timer = window.setTimeout(() => {
        markOffered();
        setOffer(open);
      }, 1400);
    };
    window.addEventListener(WEATHER_EVENT, on);
    return () => {
      window.removeEventListener(WEATHER_EVENT, on);
      window.clearTimeout(timer);
    };
  }, []);

  return <AnimatePresence>{offer && <StormySheet key="stormy" items={offer} onClose={() => setOffer(null)} />}</AnimatePresence>;
}

function StormySheet({ items, onClose }: { items: Reminder[]; onClose: () => void }) {
  const store = useStore();
  useBackClose(onClose);
  // Use the live list in case something was ticked off meanwhile.
  const live = waiting(store.snap?.reminders ?? []).filter((r) => items.some((x) => x.id === r.id));

  const pick = (keep: Reminder) => {
    onClose();
    const rest = live.filter((r) => r.id !== keep.id);
    void store.moveMany(
      rest,
      tomorrow(),
      `Just "${keep.title}" today. ${rest.length === 1 ? "The other one is" : `The other ${rest.length} are`} resting until tomorrow.`,
    );
  };

  return (
    <motion.div className="sheet-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="sheet stormy-sheet"
        role="dialog"
        aria-labelledby="stormy-title"
        initial={{ y: store.reduceMotion ? 0 : 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: store.reduceMotion ? 0 : 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="sheet-head">
          <h2 id="stormy-title">⛈️ A stormy day</h2>
        </div>
        <div className="sheet-body">
          <p className="stormy-lead">Want to pick just one thing? The rest can rest until tomorrow.</p>
          <ul className="stormy-list">
            {live.map((r, i) => (
              <li key={r.id}>
                <button className="stormy-pick" onClick={() => pick(r)} autoFocus={i === 0}>
                  <span className="stormy-name">{r.title}</span>
                  <span className="row-hint">
                    {r.date < today() ? `from ${dayName(r.date).toLowerCase()}` : r.time ? clock(r.time) : "today"}
                    {r.steps.length > 0 && ` · ${r.steps.length} tiny steps`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="hint">Medicine stays as it is.</p>
        </div>
        <div className="sheet-foot">
          <button className="btn btn-quiet btn-wide" onClick={onClose}>
            No thanks, keep today as it is
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
