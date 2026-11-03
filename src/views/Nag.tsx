import { AnimatePresence, motion } from "motion/react";
import { useStore } from "../lib/store";
import { waiting } from "../lib/native";
import { clock, dayName, today } from "../lib/dates";
import { earned } from "../lib/rewards";
import { Seed } from "../components/Icons";
import { SwipeRow } from "../components/SwipeRow";
import { DoseCard } from "../components/DoseCard";
import { GoalBars } from "../components/GoalBars";

/** The "before you dive in" screen shown on phone unlock while things are waiting. */
export function Nag() {
  const store = useStore();
  const doses = (store.snap?.doses ?? []).filter((d) => d.status === "due");
  const tasks = waiting(store.snap?.reminders ?? []);
  const shown = tasks.slice(0, Math.max(2, 5 - doses.length));
  const count = doses.length + tasks.length;
  const close = () => store.setNag(false);

  return (
    <motion.div className="nag" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-label="Things still waiting">
      <motion.div className="nag-inner" initial={{ y: 30 }} animate={{ y: 0 }} transition={{ type: "spring", stiffness: 200, damping: 24 }}>
        <p className="view-kicker">Before you dive in</p>
        <h1>
          {doses.length > 0
            ? doses.length === 1
              ? "Your medicine first"
              : `${doses.length} doses to take first`
            : count === 0
              ? "All clear."
              : count === 1
                ? "One thing is still waiting"
                : `${count} things are still waiting`}
        </h1>
        <p className="view-sub">
          {doses.length > 0
            ? "Take it now and tap Take, so it's off your mind."
            : count
              ? "Pick one tiny step if you've got a moment. Or don't — it'll keep."
              : "Nothing left for today. Enjoy your phone."}
        </p>

        {doses.length > 0 && (
          <div className="list nag-doses">
            <AnimatePresence>
              {doses.map((d) => (
                <DoseCard key={d.id} d={d} />
              ))}
            </AnimatePresence>
          </div>
        )}

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
                  <SwipeRow
                    label={r.title}
                    doneLabel={next ? next.title : "Done"}
                    onDone={() => (next ? store.toggleStep(r, next.id, true) : store.complete(r))}
                    onLater={() => store.notToday(r)}
                    reduceMotion={store.reduceMotion}
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
                    </div>
                  </SwipeRow>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
        {shown.length > 0 && <p className="hint swipe-hint">Swipe right when it's done, left to save it for tomorrow.</p>}
        {tasks.length > shown.length && <p className="hint">and {tasks.length - shown.length} more in Today.</p>}

        {/* Just for a glance: steps never make this screen appear on their own. */}
        <GoalBars compact />

        <div className="nag-foot">
          <button className="btn btn-primary btn-wide" onClick={close}>
            {count ? "Carry on to my phone" : "Close"}
          </button>
          {count > 0 && (
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
