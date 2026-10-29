import { AnimatePresence, motion } from "motion/react";
import { useStore } from "../lib/store";
import { waiting } from "../lib/native";
import { clock, dayName, today } from "../lib/dates";
import { earned } from "../lib/rewards";
import { Check, Moon, Seed } from "../components/Icons";

/** The "before you dive in" screen shown on phone unlock while things are waiting. */
export function Nag() {
  const store = useStore();
  const items = waiting(store.snap?.reminders ?? []);
  const shown = items.slice(0, 5);
  const close = () => store.setNag(false);

  return (
    <motion.div className="nag" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-label="Things still waiting">
      <motion.div className="nag-inner" initial={{ y: 30 }} animate={{ y: 0 }} transition={{ type: "spring", stiffness: 200, damping: 24 }}>
        <p className="view-kicker">Before you dive in</p>
        <h1>{items.length === 0 ? "All clear." : items.length === 1 ? "One thing is still waiting" : `${items.length} things are still waiting`}</h1>
        <p className="view-sub">{items.length ? "Pick one tiny step if you've got a moment. Or don't — it'll keep." : "Nothing left for today. Enjoy your phone."}</p>

        <ul className="nag-list">
          <AnimatePresence>
            {shown.map((r, i) => {
              const next = r.steps.find((s) => !s.done);
              return (
                <motion.li
                  key={r.id}
                  layout
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 40 }}
                  transition={{ delay: store.reduceMotion ? 0 : i * 0.05 }}
                >
                  <div className="nag-item">
                    <div className="nag-text">
                      <strong>{r.title}</strong>
                      <span>
                        {r.date < today() ? `from ${dayName(r.date).toLowerCase()}` : r.time ? clock(r.time) : "today"}
                        {r.steps.length > 0 && ` · ${r.steps.filter((s) => s.done).length}/${r.steps.length} steps`}
                        {" · "}
                        <Seed size={11} /> {r.reward - earned(r)} to gather
                      </span>
                    </div>
                    <div className="nag-actions">
                      {next ? (
                        <button className="btn btn-soft" onClick={() => void store.toggleStep(r, next.id, true)}>
                          <Check size={15} /> {next.title}
                        </button>
                      ) : (
                        <button className="btn btn-soft" onClick={() => void store.complete(r)}>
                          <Check size={15} /> Done
                        </button>
                      )}
                      <button className="btn btn-quiet btn-icon" aria-label={`Not today: ${r.title}`} onClick={() => void store.notToday(r)}>
                        <Moon size={16} />
                      </button>
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
        {items.length > shown.length && <p className="hint">and {items.length - shown.length} more in Today.</p>}

        <div className="nag-foot">
          <button className="btn btn-primary btn-wide" onClick={close}>
            {items.length ? "Carry on to my phone" : "Close"}
          </button>
          {items.length > 0 && (
            <button
              className="link"
              onClick={() => {
                close();
                store.updateSettings({ nagOnUnlock: false });
                store.toast("Unlock screen paused. Turn it back on in Settings.", () => store.updateSettings({ nagOnUnlock: true }));
              }}
            >
              Pause this screen
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
