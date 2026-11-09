import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import { appUpdater } from "../lib/updater";
import { sounds } from "../lib/sound";
import type { Settings } from "../lib/settings";

const OPTIONS: { value: Settings["updateChannel"]; emoji: string; title: string; blurb: string }[] = [
  { value: "stable", emoji: "🌳", title: "Stable", blurb: "Tried-and-tested updates only. The calm choice." },
  { value: "unstable", emoji: "🌱", title: "Unstable", blurb: "New things first, while they're still being tried. The odd rough edge, and your data stays safe either way." },
];

/** Asked once after updating: which updates to follow. Waits until nothing else is showing. */
export function ChannelChoice({ blocked }: { blocked: boolean }) {
  const { settings, updateSettings, snap, nag, reduceMotion } = useStore();
  const [pick, setPick] = useState(settings.updateChannel);
  const [ready, setReady] = useState(false);
  const needed = appUpdater.supported && settings.onboarded && !settings.channelAsked;

  // A beat after opening, so it doesn't land on top of the first paint.
  useEffect(() => {
    if (!needed || blocked || nag || !snap) return;
    const t = window.setTimeout(() => setReady(true), 700);
    return () => window.clearTimeout(t);
  }, [needed, blocked, nag, snap]);

  const open = needed && ready && !blocked && !nag;
  const done = () => {
    sounds.tap();
    updateSettings({ updateChannel: pick, channelAsked: true });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="sheet-scrim" key="channel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="sheet feature-offer"
            role="dialog"
            aria-labelledby="channel-title"
            initial={reduceMotion ? { opacity: 0 } : { y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 330, damping: 30 }}
            onKeyDown={(e) => e.key === "Escape" && done()}
          >
            <div className="sheet-head">
              <div>
                <p className="view-kicker">Updates</p>
                <h2 id="channel-title">Which updates would you like?</h2>
              </div>
            </div>
            <div className="sheet-body">
              <div className="feature-list" role="radiogroup" aria-labelledby="channel-title">
                {OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    role="radio"
                    aria-checked={pick === o.value}
                    className={`feature-row channel-option ${pick === o.value ? "is-on" : ""}`}
                    onClick={() => setPick(o.value)}
                  >
                    <span className="feature-emoji" aria-hidden>
                      {o.emoji}
                    </span>
                    <span className="feature-text">
                      <strong>{o.title}</strong>
                      <span className="row-hint">{o.blurb}</span>
                    </span>
                    <span className={`channel-dot ${pick === o.value ? "is-on" : ""}`} aria-hidden />
                  </button>
                ))}
              </div>
              <p className="row-hint">You can switch any time in Settings → Updates.</p>
            </div>
            <div className="sheet-foot">
              <button className="btn btn-primary btn-wide" autoFocus onClick={done}>
                {pick === "stable" ? "Stay on stable" : "Try unstable"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
