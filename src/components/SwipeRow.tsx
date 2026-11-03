import { animate, AnimatePresence, motion, useMotionValue, useMotionValueEvent, useTransform } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { Check, Moon } from "./Icons";
import { sounds } from "../lib/sound";

interface Props {
  /** What a right swipe confirms, e.g. "Done" or the next step's name. */
  doneLabel: string;
  label: string;
  onDone: () => Promise<void> | void;
  onLater: () => Promise<void> | void;
  /** "Not now": records nothing and moves nothing, just lets the row go. */
  onSkip: () => void;
  /** Accessibility setting: always show the buttons (and don't swipe). */
  buttons: boolean;
  reduceMotion: boolean;
  children: ReactNode;
}

/** How far (share of the row's width) a drag must go before letting go confirms it. */
const THRESHOLD = 0.4;

/**
 * Swipe right to confirm, left to save for tomorrow. A tap only reveals labelled buttons
 * (Done / Tomorrow / Not now), so a stray touch while unlocking can't tick anything off, and
 * there is always a way that needs no swipe (WCAG 2.5.1). Arrow keys work too.
 */
export function SwipeRow({ doneLabel, label, onDone, onLater, onSkip, buttons, reduceMotion, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [armed, setArmed] = useState<0 | 1 | -1>(0);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const width = () => ref.current?.offsetWidth ?? 320;
  const showButtons = buttons || revealed;

  const doneOpacity = useTransform(x, [0, 24, 90], [0, 0.5, 1]);
  const laterOpacity = useTransform(x, [-90, -24, 0], [1, 0.5, 0]);

  // Tell the hand when letting go will count.
  useMotionValueEvent(x, "change", (v) => {
    const t = width() * THRESHOLD;
    const next = v > t ? 1 : v < -t ? -1 : 0;
    if (next !== armed) {
      if (next !== 0) sounds.tap();
      setArmed(next);
    }
  });

  async function commit(dir: 1 | -1) {
    if (busy) return;
    setBusy(true);
    if (dir > 0) sounds.tap();
    await animate(x, dir * width() * 1.1, reduceMotion ? { duration: 0 } : { duration: 0.2, ease: "easeIn" });
    try {
      await (dir > 0 ? onDone() : onLater());
    } finally {
      // A task with more steps stays on screen: bring it back for the next one.
      setArmed(0);
      setBusy(false);
      if (!buttons) setRevealed(false);
      if (reduceMotion) x.set(0);
      else void animate(x, 0, { type: "spring", stiffness: 300, damping: 30 });
    }
  }

  return (
    <div className={`swipe ${buttons ? "is-buttons" : ""}`}>
      <div ref={ref} className="swipe-track">
        {!buttons && (
          <>
            <motion.div className={`swipe-bg swipe-done ${armed === 1 ? "is-armed" : ""}`} style={{ opacity: doneOpacity }} aria-hidden="true">
              <Check size={18} />
              <span>{doneLabel}</span>
            </motion.div>
            <motion.div className={`swipe-bg swipe-later ${armed === -1 ? "is-armed" : ""}`} style={{ opacity: laterOpacity }} aria-hidden="true">
              <span>Tomorrow</span>
              <Moon size={18} />
            </motion.div>
          </>
        )}
        <motion.div
          className="swipe-card"
          style={{ x }}
          drag={busy || buttons ? false : "x"}
          dragDirectionLock
          dragMomentum={false}
          dragElastic={0.85}
          dragConstraints={{ left: 0, right: 0 }}
          onDragEnd={(_, info) => {
            // Judge by where the card is (what the armed colour showed), not the finger.
            const at = x.get();
            const t = width() * THRESHOLD;
            const flick = Math.abs(info.velocity.x) > 700 && Math.abs(at) > 50;
            if (at > t || (flick && at > 0)) void commit(1);
            else if (at < -t || (flick && at < 0)) void commit(-1);
          }}
          onTap={() => !buttons && setRevealed((r) => !r)}
          tabIndex={0}
          role="group"
          aria-expanded={buttons ? undefined : revealed}
          aria-label={`${label}. Right arrow: ${doneLabel}. Left arrow: save for tomorrow.${buttons ? "" : " Enter shows buttons."}`}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") void commit(1);
            if (e.key === "ArrowLeft") void commit(-1);
            if ((e.key === "Enter" || e.key === " ") && !buttons && e.target === e.currentTarget) {
              e.preventDefault();
              setRevealed((r) => !r);
            }
          }}
        >
          {children}
        </motion.div>
      </div>
      <AnimatePresence initial={false}>
        {showButtons && (
          <motion.div
            className="swipe-buttons"
            initial={reduceMotion || buttons ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, height: 0 }}
          >
            <button className="btn btn-soft" disabled={busy} onClick={() => void commit(1)}>
              <Check size={16} /> <span>{doneLabel}</span>
            </button>
            <button className="btn btn-quiet" disabled={busy} onClick={() => void commit(-1)}>
              <Moon size={16} /> Tomorrow
            </button>
            <button className="btn btn-quiet" disabled={busy} onClick={onSkip}>
              Not now
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
