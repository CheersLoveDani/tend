import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { Reminder } from "../lib/api";
import { useStore } from "../lib/store";
import { clock, dayName, partOfDay, today } from "../lib/dates";
import { bitValue, earned, finishValue, MAX_BITS, stepValue } from "../lib/rewards";
import { Check, Chevron, Clock, Moon, Repeat, Seed, Sprout, Trash } from "./Icons";

interface Props {
  r: Reminder;
  onEdit: (r: Reminder) => void;
  compact?: boolean;
}

export function TaskCard({ r, onEdit, compact }: Props) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const done = r.status === "done";
  const got = earned(r);
  const pct = Math.min(100, (got / r.reward) * 100);
  const stepsDone = r.steps.filter((s) => s.done).length;
  const fromBefore = !done && r.date < today();
  const next = r.steps.find((s) => !s.done);

  const meta: string[] = [];
  if (fromBefore) meta.push(`from ${dayName(r.date).toLowerCase()}`);
  if (r.time) meta.push(r.date === today() ? `${clock(r.time)}, ${partOfDay(r.time)}` : clock(r.time));
  if (r.steps.length) meta.push(`${stepsDone} of ${r.steps.length} steps`);

  return (
    <motion.article
      layout="position"
      className={`card ${done ? "is-done" : ""} ${open ? "is-open" : ""}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -30, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
    >
      <div className="card-row">
        <motion.button
          className="check"
          aria-label={done ? `Mark "${r.title}" as not done` : `Mark "${r.title}" as done`}
          aria-pressed={done}
          whileTap={{ scale: 0.86 }}
          onClick={(e) => {
            e.stopPropagation();
            if (done) void store.reopen(r);
            else void store.complete(r);
          }}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <motion.path
              d="m5 12.5 4.5 4.5L19 7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
              transition={{ duration: 0.35 }}
            />
          </svg>
          {!done && pct > 0 && (
            <svg className="check-ring" viewBox="0 0 40 40" aria-hidden>
              <motion.circle
                cx="20"
                cy="20"
                r="18"
                initial={false}
                animate={{ pathLength: pct / 100 }}
                transition={{ type: "spring", stiffness: 90, damping: 16 }}
              />
            </svg>
          )}
        </motion.button>

        <button className="card-main" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="card-title">{r.title}</span>
          {(meta.length > 0 || r.repeat) && (
            <span className="card-meta">
              {r.time && <Clock size={13} />}
              {meta.join(" · ")}
              {r.repeat && (
                <span className="card-repeat">
                  <Repeat size={13} /> {r.repeat}
                </span>
              )}
            </span>
          )}
          {!compact && !done && next && !open && <span className="card-next">Next: {next.title}</span>}
        </button>

        <div className={`reward-chip ${done ? "is-earned" : ""}`} title={`${got} of ${r.reward} seeds`}>
          <Seed size={14} />
          <span>{done ? r.reward : got > 0 ? `${got}/${r.reward}` : r.reward}</span>
        </div>
        <motion.span className="card-chevron" animate={{ rotate: open ? 90 : 0 }} aria-hidden>
          <Chevron size={16} />
        </motion.span>
      </div>

      {!done && got > 0 && (
        <div className="card-progress" aria-hidden>
          <motion.div className="card-progress-fill" initial={false} animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="card-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
          >
            {r.notes && <p className="card-notes">{r.notes}</p>}

            {r.steps.length > 0 && (
              <ul className="steps">
                {r.steps.map((s, i) => (
                  <motion.li key={s.id} layout className={s.done ? "is-done" : ""}>
                    <label>
                      <input
                        type="checkbox"
                        checked={s.done}
                        onChange={(e) => void store.toggleStep(r, s.id, e.target.checked)}
                      />
                      <motion.span className="step-box" whileTap={{ scale: 0.8 }}>
                        <AnimatePresence>
                          {s.done && (
                            <motion.span
                              initial={{ scale: 0, rotate: -40 }}
                              animate={{ scale: 1, rotate: 0 }}
                              exit={{ scale: 0 }}
                              transition={{ type: "spring", stiffness: 500, damping: 18 }}
                            >
                              <Check size={14} />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.span>
                      <span className="step-title">
                        {i === stepsDone && !s.done && <span className="step-now">Next</span>}
                        {s.title}
                      </span>
                      <span className="step-value">
                        <Seed size={11} /> {stepValue(r)}
                      </span>
                    </label>
                  </motion.li>
                ))}
              </ul>
            )}

            {!done && (
              <p className="card-promise">
                {got > 0 ? (
                  <>
                    You've gathered {got} seeds here. Finishing adds <strong>{finishValue(r)}</strong> more.
                  </>
                ) : r.steps.length ? (
                  <>
                    Each step gives {stepValue(r)} seeds. The whole thing is worth <strong>{r.reward}</strong>.
                  </>
                ) : (
                  <>
                    Worth <strong>{r.reward}</strong> seeds. Even a bit of it counts.
                  </>
                )}
              </p>
            )}

            <div className="card-actions">
              {!done && r.steps.length === 0 && (
                <button
                  className="btn btn-soft"
                  disabled={r.bits >= MAX_BITS}
                  onClick={() => void store.didABit(r)}
                  title="Log some progress without finishing"
                >
                  <Sprout size={16} />
                  {r.bits >= MAX_BITS ? "Plenty of bits logged" : `I did a bit (+${bitValue(r)})`}
                </button>
              )}
              {!done && (
                <button className="btn btn-quiet" onClick={() => void store.notToday(r)}>
                  <Moon size={16} /> Not today
                </button>
              )}
              <button className="btn btn-quiet" onClick={() => onEdit(r)}>
                Edit
              </button>
              <button className="btn btn-quiet btn-icon" aria-label={`Remove "${r.title}"`} onClick={() => void store.remove(r)}>
                <Trash size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
