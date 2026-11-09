import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import { featuresToOffer, openSettings, wasJustOnboarded, type Feature } from "../lib/features";
import { sounds } from "../lib/sound";
import { Check } from "./Icons";

/**
 * "Something new to try": features this person hasn't seen yet and that aren't on, offered once
 * when the app opens. Each can be switched on right here (or set up in Settings when it needs a
 * permission). Whatever they choose, it isn't asked again; everything stays in Settings.
 */
export function FeatureOffer({ blocked }: { blocked: boolean }) {
  const { settings, updateSettings, snap, nag, reduceMotion } = useStore();
  // Frozen when it opens, so switching one on doesn't make its row vanish.
  const [list, setList] = useState<Feature[] | null>(null);
  const [done, setDone] = useState<string[]>([]);

  useEffect(() => {
    if (list || blocked || nag || !snap || !settings.onboarded || wasJustOnboarded()) return;
    const offer = featuresToOffer(settings);
    if (!offer.length) return;
    // A moment after opening, so it doesn't land on top of the first paint.
    const t = window.setTimeout(() => setList(offer), 900);
    return () => window.clearTimeout(t);
  }, [list, blocked, nag, snap, settings]);

  const open = !!list && list.length > 0 && !blocked && !nag;
  const seen = (ids: string[]) => updateSettings({ seenFeatures: [...new Set([...settings.seenFeatures, ...ids])] });

  const close = () => {
    if (list) seen(list.map((f) => f.id));
    setList([]);
  };

  const turnOn = (f: Feature) => {
    sounds.tap();
    if (f.turnOn) {
      updateSettings({ ...f.turnOn, seenFeatures: [...new Set([...settings.seenFeatures, f.id])] });
      setDone((d) => [...d, f.id]);
      return;
    }
    // Needs a permission or a choice: take them to it.
    close();
    openSettings(f.section);
  };

  const allDone = !!list && list.every((f) => done.includes(f.id));

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="sheet-scrim" key="feature-offer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
          <motion.div
            className="sheet feature-offer"
            role="dialog"
            aria-labelledby="feature-offer-title"
            initial={reduceMotion ? { opacity: 0 } : { y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 330, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === "Escape" && close()}
          >
            <div className="sheet-head">
              <div>
                <p className="view-kicker">{list!.length === 1 ? "Something new" : "A few new things"}</p>
                <h2 id="feature-offer-title">Would you like to try {list!.length === 1 ? "this" : "these"}?</h2>
              </div>
            </div>
            <div className="sheet-body">
              <ul className="feature-list">
                {list!.map((f) => {
                  const on = done.includes(f.id);
                  return (
                    <li key={f.id} className={`feature-row ${on ? "is-on" : ""}`}>
                      <span className="feature-emoji" aria-hidden>
                        {f.emoji}
                      </span>
                      <span className="feature-text">
                        <strong>{f.title}</strong>
                        <span className="row-hint">{f.blurb}</span>
                      </span>
                      <AnimatePresence mode="popLayout" initial={false}>
                        {on ? (
                          <motion.span
                            key="on"
                            className="feature-on"
                            initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 420, damping: 20 }}
                          >
                            <Check size={16} /> On
                          </motion.span>
                        ) : (
                          <motion.button key="btn" className="btn btn-soft" exit={{ opacity: 0, scale: 0.9 }} onClick={() => turnOn(f)}>
                            {f.turnOn ? "Turn on" : "Set up"}
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </li>
                  );
                })}
              </ul>
              <p className="row-hint">You can change any of these later in Settings. Tend won't ask about them again.</p>
            </div>
            <div className="sheet-foot">
              <button className={`btn btn-wide ${allDone ? "btn-primary" : "btn-soft"}`} autoFocus onClick={close}>
                {allDone ? "Done" : done.length ? "That's all for now" : "Maybe later"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
