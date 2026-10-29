import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { sounds } from "../lib/sound";
import type { RewardEvent } from "../lib/api";
import { Seed } from "./Icons";
import { Tree } from "./Tree";

let lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
window.addEventListener("pointerdown", (e) => (lastPointer = { x: e.clientX, y: e.clientY }), { capture: true });

interface Particle {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  rot: number;
  kind: "leaf" | "seed" | "petal";
  delay: number;
  sx: number;
  sy: number;
}

let pid = 0;

function counterPos() {
  for (const id of ["seed-counter-rail", "seed-counter-top"]) {
    const r = document.getElementById(id)?.getBoundingClientRect();
    if (r && r.width > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: window.innerWidth - 40, y: 30 };
}

export function RewardLayer() {
  const { rewards, consumeReward, reduceMotion } = useStore();
  const [particles, setParticles] = useState<Particle[]>([]);
  const [floater, setFloater] = useState<{ id: number; x: number; y: number; text: string; sub?: string } | null>(null);
  const [finish, setFinish] = useState<RewardEvent | null>(null);
  const [levelUp, setLevelUp] = useState<RewardEvent | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (busy.current || rewards.length === 0 || finish || levelUp) return;
    const e = rewards[0];
    busy.current = true;
    const origin = { ...lastPointer };
    const target = counterPos();
    const leveled = e.after.level > e.before.level;

    if (e.kind === "step" || e.kind === "bit") {
      if (e.kind === "step") sounds.step(e.reminder.steps.filter((s) => s.done).length - 1);
      else sounds.bit();
      setFloater({
        id: ++pid,
        x: origin.x,
        y: origin.y,
        text: `+${e.gained}`,
        sub: e.remaining > 0 ? `${e.remaining} more when it's done` : undefined,
      });
      if (!reduceMotion) spawn(origin, target, Math.min(7, 2 + Math.round(e.gained / 3)), ["seed", "leaf"]);
      window.setTimeout(() => {
        busy.current = false;
        consumeReward();
        if (leveled) setLevelUp(e);
      }, 650);
    } else if (e.kind === "finish") {
      sounds.finish();
      if (e.bonus > 0) sounds.bonus();
      if (!reduceMotion) {
        spawn(origin, target, 14, ["seed", "leaf", "petal"]);
      }
      setFinish(e);
      window.setTimeout(() => {
        setFinish(null);
        busy.current = false;
        consumeReward();
        if (leveled) setLevelUp(e);
      }, e.bonus > 0 ? 2300 : 1700);
    } else {
      busy.current = false;
      consumeReward();
    }
  }, [rewards, finish, levelUp, consumeReward, reduceMotion]);

  useEffect(() => {
    if (levelUp) sounds.levelUp();
  }, [levelUp]);

  function spawn(origin: { x: number; y: number }, target: { x: number; y: number }, n: number, kinds: Particle["kind"][]) {
    const ps: Particle[] = Array.from({ length: n }, (_, i) => ({
      id: ++pid,
      x: origin.x,
      y: origin.y,
      dx: target.x - origin.x,
      dy: target.y - origin.y,
      rot: (Math.random() - 0.5) * 540,
      kind: kinds[i % kinds.length],
      delay: i * 0.035,
      sx: (Math.random() - 0.5) * 140,
      sy: -40 - Math.random() * 90,
    }));
    setParticles((p) => [...p, ...ps]);
    window.setTimeout(() => setParticles((p) => p.filter((x) => !ps.includes(x))), 1600);
  }

  return (
    <div className="reward-layer" aria-live="polite">
      {particles.map((p) => {
        const spreadX = p.sx;
        const spreadY = p.sy;
        const isSeed = p.kind === "seed";
        return (
          <motion.div
            key={p.id}
            className={`particle particle-${p.kind}`}
            style={{ left: p.x, top: p.y }}
            initial={{ x: 0, y: 0, scale: 0.3, opacity: 0, rotate: 0 }}
            animate={
              isSeed
                ? { x: [0, spreadX, p.dx], y: [0, spreadY, p.dy], scale: [0.3, 1.1, 0.5], opacity: [0, 1, 0.9], rotate: p.rot }
                : { x: [0, spreadX, spreadX * 1.3], y: [0, spreadY, spreadY + 120], scale: [0.3, 1, 0.8], opacity: [0, 1, 0], rotate: p.rot }
            }
            transition={{ duration: isSeed ? 0.9 : 1.4, delay: p.delay, ease: [0.3, 0.7, 0.4, 1], times: [0, 0.35, 1] }}
          >
            {p.kind === "seed" ? <Seed size={14} /> : <span className="particle-shape" />}
          </motion.div>
        );
      })}

      <AnimatePresence>
        {floater && (
          <motion.div
            key={floater.id}
            className="floater"
            style={{ left: floater.x, top: floater.y }}
            initial={{ opacity: 0, y: 0, scale: 0.8 }}
            animate={{ opacity: [0, 1, 1, 0], y: -64, scale: 1 }}
            transition={{ duration: 1.5, times: [0, 0.15, 0.7, 1], ease: "easeOut" }}
            onAnimationComplete={() => setFloater((f) => (f?.id === floater.id ? null : f))}
          >
            <span className="floater-amount">
              <Seed size={14} /> {floater.text}
            </span>
            {floater.sub && <span className="floater-sub">{floater.sub}</span>}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {finish && (
          <motion.div
            className="finish-card"
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
          >
            <motion.div
              className="finish-ring"
              initial={{ scale: 0.4, opacity: 0.9 }}
              animate={{ scale: 2.4, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 1.1, ease: "easeOut" }}
            />
            <div className="finish-check">
              <svg viewBox="0 0 24 24" width="30" height="30">
                <motion.path
                  d="m5 12.5 4.5 4.5L19 7.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.45, delay: 0.1 }}
                />
              </svg>
            </div>
            <div className="finish-text">
              <strong>{finish.reminder.title}</strong>
              <span>
                Done. <Seed size={13} /> +{finish.gained} seeds
              </span>
              {finish.bonus > 0 && (
                <motion.span
                  className="finish-bonus"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5, type: "spring", stiffness: 300, damping: 14 }}
                >
                  A bird left a golden seed: +{finish.bonus}
                </motion.span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {levelUp && (
          <motion.div
            className="levelup-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLevelUp(null)}
          >
            <motion.div
              className="levelup"
              initial={{ scale: 0.9, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 180, damping: 20 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label={`Level ${levelUp.after.level}`}
            >
              <motion.div
                className="levelup-glow"
                animate={reduceMotion ? undefined : { scale: [1, 1.08, 1], opacity: [0.6, 0.9, 0.6] }}
                transition={{ duration: 3, repeat: Infinity }}
              />
              <Tree level={levelUp.after.level} progress={levelUp.after.intoLevel / levelUp.after.levelSize} size={220} still={reduceMotion} />
              <h2>Level {levelUp.after.level}</h2>
              <p className="levelup-stage">
                {levelUp.after.stage !== levelUp.before.stage
                  ? `Your tree became a ${levelUp.after.stage.toLowerCase()}.`
                  : `Your ${levelUp.after.stage.toLowerCase()} grew a little more.`}
              </p>
              <p className="levelup-total">
                <Seed size={14} /> {levelUp.after.xp} seeds gathered so far
              </p>
              <button className="btn btn-primary" onClick={() => setLevelUp(null)} autoFocus>
                Lovely
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
