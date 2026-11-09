import { motion, type TargetAndTransition, type Transition } from "motion/react";
import type { JSX, ReactNode } from "react";

/* Garden wildlife for the tree. Flat, soft, nature-guide style: small shapes, a few
   colours each, no expressions. Everything is drawn facing right; `facing={-1}` mirrors.
   Colours live in wildlife.css (`wl-` classes) so the dark theme can nudge them. */

export type Species = "wren" | "bluetit" | "chick" | "swallow" | "butterfly" | "hedgehog" | "squirrel" | "robin" | "owl";
export type Pose = "idle" | "hop" | "walk" | "fly" | "sleep";

export const SPECIES_INFO: Record<Species, { name: string; plural: string }> = {
  wren: { name: "wren", plural: "wrens" },
  bluetit: { name: "blue tit", plural: "blue tits" },
  chick: { name: "blue tit chick", plural: "blue tit chicks" },
  swallow: { name: "swallow", plural: "swallows" },
  butterfly: { name: "butterfly", plural: "butterflies" },
  hedgehog: { name: "hedgehog", plural: "hedgehogs" },
  squirrel: { name: "red squirrel", plural: "red squirrels" },
  robin: { name: "robin", plural: "robins" },
  owl: { name: "tawny owl", plural: "tawny owls" },
};

/** Drawing box per species. The anchor (feet on the perch / ground) is bottom-centre,
    except the butterfly, which is anchored at its centre. */
const BOX: Record<Species, [number, number]> = {
  wren: [32, 26],
  bluetit: [32, 26],
  chick: [24, 22],
  swallow: [40, 24],
  butterfly: [28, 24],
  hedgehog: [40, 24],
  squirrel: [36, 32],
  robin: [32, 26],
  owl: [28, 32],
};

const GROUND: Species[] = ["hedgehog", "squirrel"];

type Anim = { animate?: TargetAndTransition; transition?: Transition };
const NONE: Anim = {};

/** Transform origin in drawing coordinates (Motion defaults SVG to fill-box otherwise). */
function at(x: number, y: number) {
  return { transformBox: "view-box" as const, originX: `${x}px`, originY: `${y}px` };
}

function loop(still: boolean | undefined, animate: TargetAndTransition, duration: number, extra: Transition = {}): Anim {
  if (still) return NONE;
  return { animate, transition: { duration, repeat: Infinity, ease: "easeInOut", ...extra } };
}

interface Ctx {
  pose: Pose;
  still?: boolean;
  excited?: boolean;
  /** Per-species offset so a flock doesn't blink in unison. */
  phase: number;
}

/* ---------- shared parts ---------- */

function Eye({ x, y, r = 0.95, c }: { x: number; y: number; r?: number; c: Ctx }) {
  if (c.pose === "sleep") {
    return <path d={`M${x - r * 1.3} ${y - r * 0.1} q${r * 1.3} ${r * 1.1} ${r * 2.6} 0`} className="wl-lid" />;
  }
  return (
    <motion.ellipse
      cx={x}
      cy={y}
      rx={r}
      ry={r}
      className="wl-eye"
      {...loop(c.still, { scaleY: [1, 1, 0.15, 1] }, 5.2 + c.phase, { times: [0, 0.95, 0.975, 1], ease: "linear" })}
    />
  );
}

/** A folded wing that lifts and beats when flying or excited. Pivot is the shoulder. */
function Wing({ sx, sy, c, children }: { sx: number; sy: number; c: Ctx; children: ReactNode }) {
  let anim: Anim = NONE;
  if (!c.still) {
    if (c.pose === "fly") anim = { animate: { scaleY: [1, -0.9, 1] }, transition: { duration: 0.34, repeat: Infinity, ease: "easeInOut" } };
    else if (c.excited) anim = { animate: { scaleY: [1, -0.7, 1, -0.6, 1] }, transition: { duration: 0.6 } };
    else anim = { animate: { scaleY: 1 }, transition: { duration: 0.2 } };
  }
  return (
    <motion.g style={at(sx, sy)} {...anim}>
      {children}
    </motion.g>
  );
}

/** Tail that flicks now and then while idle. */
function Tail({ px, py, c, deg = -14, children }: { px: number; py: number; c: Ctx; deg?: number; children: ReactNode }) {
  const anim =
    c.pose === "idle" || c.pose === "hop"
      ? loop(c.still, { rotate: [0, 0, deg, 0, 0] }, 6.5 + c.phase * 1.7, { times: [0, 0.8, 0.84, 0.9, 1] })
      : NONE;
  return (
    <motion.g style={at(px, py)} {...anim}>
      {children}
    </motion.g>
  );
}

function Legs({ xs, top, bottom, c }: { xs: number[]; top: number; bottom: number; c: Ctx }) {
  if (c.pose === "fly") return null;
  return (
    <g className="wl-leg">
      {xs.map((x, i) => (
        <path key={i} d={`M${x} ${top} L${x - 0.4} ${bottom} M${x - 1.8} ${bottom - 0.2} h3`} />
      ))}
    </g>
  );
}

/* ---------- species ---------- */

function Wren({ c }: { c: Ctx }) {
  return (
    <>
      <Legs xs={[13.5, 18]} top={21} bottom={25.6} c={c} />
      <Tail px={9.5} py={13.5} c={c} deg={-16}>
        <path d="M10.5 15 L4.2 5.6 Q5.4 3.8 7.4 4.6 L12.6 13.2 Z" className="wl-wren-dark" />
      </Tail>
      <ellipse cx="15.5" cy="15.8" rx="8.6" ry="7" className="wl-wren" />
      <circle cx="21" cy="11.6" r="5" className="wl-wren" />
      <ellipse cx="18.2" cy="19" rx="5.2" ry="3.6" className="wl-wren-belly" />
      <path d="M17.6 9.9 Q21.4 8 25.2 10.2" className="wl-wren-brow" />
      <Eye x={22.5} y={11.3} c={c} />
      <path d="M25.4 11.4 L29.4 12.2 L25.4 13 Z" className="wl-beak-dark" />
      <Wing sx={16} sy={12.6} c={c}>
        <path d="M17.6 12.6 Q12 11.8 8.6 16.6 Q13 19.6 17.8 17 Z" className="wl-wren-dark" />
        <path d="M11.2 16.2 l1.6 -1 M13.4 16.8 l1.6 -1 M15.6 16.8 l1.4 -1" className="wl-bars" />
      </Wing>
    </>
  );
}

function BlueTit({ c }: { c: Ctx }) {
  return (
    <>
      <Legs xs={[13.5, 18]} top={21.5} bottom={25.6} c={c} />
      <Tail px={9} py={18} c={c} deg={10}>
        <path d="M9.6 16.4 L2.4 19.6 L3 21.8 L10.4 19.8 Z" className="wl-tit-blue" />
      </Tail>
      <ellipse cx="15" cy="16.6" rx="8" ry="6.6" className="wl-tit-back" />
      <ellipse cx="17.6" cy="18.4" rx="6" ry="5" className="wl-tit-belly" />
      <circle cx="21" cy="10.8" r="5.2" className="wl-tit-cheek" />
      <path d="M15.8 10.4 Q16.4 5 21.4 5.4 Q25.8 5.8 26.2 9.4 Q21 7.8 15.8 10.4 Z" className="wl-tit-blue" />
      <path d="M16.6 11.6 Q21 9.4 25.8 10.4 L25.6 11.6 Q21.2 10.8 17 12.8 Z" className="wl-tit-stripe" />
      <path d="M17.4 13.4 Q20.2 16.2 23.6 15.4" className="wl-tit-collar" />
      <path d="M23.2 14.2 Q25 13.6 25.4 12.6 Q25.8 14.8 23.8 15.8 Z" className="wl-tit-stripe" />
      <Eye x={22.6} y={10.7} r={0.8} c={c} />
      <path d="M25.8 10.6 L28.2 11.4 L25.8 12.3 Z" className="wl-beak-dark" />
      <Wing sx={15.5} sy={13.4} c={c}>
        <path d="M17.6 13.2 Q12 12.4 8.4 17 Q13 20.2 17.8 17.4 Z" className="wl-tit-blue" />
        <path d="M11.2 15.4 Q13.8 14.4 16.4 15" className="wl-tit-bar" />
      </Wing>
    </>
  );
}

function Chick({ c }: { c: Ctx }) {
  return (
    <>
      <Legs xs={[10.5, 13.8]} top={19} bottom={21.6} c={c} />
      <circle cx="11.6" cy="13.8" r="7" className="wl-chick" />
      <ellipse cx="13" cy="16" rx="4.6" ry="4" className="wl-chick-belly" />
      <circle cx="15.2" cy="8.8" r="4.2" className="wl-chick" />
      <circle cx="13.8" cy="4.9" r="1.3" className="wl-chick-cap" />
      <circle cx="15.6" cy="4.5" r="1.1" className="wl-chick-cap" />
      <Eye x={16.4} y={8.6} r={0.75} c={c} />
      <path d="M18.8 8.2 L21.6 9.2 L18.8 10.4 Z" className="wl-gape" />
      <Wing sx={10.5} sy={11.5} c={c}>
        <ellipse cx="9.4" cy="13.8" rx="3.6" ry="2.6" className="wl-chick-wing" />
      </Wing>
    </>
  );
}

function Swallow({ c }: { c: Ctx }) {
  if (c.pose === "fly") {
    return (
      <>
        <path d="M14.6 11.4 L1.4 6.2 L12.6 12.6 L2.2 17.4 L14.6 13.8 Z" className="wl-swallow-dark" />
        <ellipse cx="21" cy="12.2" rx="8" ry="3.2" className="wl-swallow" />
        <ellipse cx="22" cy="13.6" rx="6" ry="1.7" className="wl-swallow-belly" />
        <circle cx="28" cy="11.4" r="3.2" className="wl-swallow" />
        <circle cx="29.6" cy="13" r="1.6" className="wl-swallow-red" />
        <Eye x={28.8} y={10.6} r={0.65} c={c} />
        <path d="M31 11 L33.2 11.7 L31 12.3 Z" className="wl-beak-dark" />
        <Wing sx={22.5} sy={11.4} c={c}>
          <path d="M24.4 11.2 Q18 2.4 7 0.6 Q16.2 5.4 20.4 12.4 Z" className="wl-swallow-dark" />
        </Wing>
      </>
    );
  }
  return (
    <>
      <Legs xs={[21, 23.4]} top={19.6} bottom={23.6} c={c} />
      <Tail px={15} py={17} c={c} deg={6}>
        <path d="M16 16.6 L2 21.6 M16.8 17.6 L4 23.2" className="wl-swallow-streamer" />
      </Tail>
      <ellipse cx="21.6" cy="15.4" rx="7.6" ry="4.8" transform="rotate(-14 21.6 15.4)" className="wl-swallow" />
      <ellipse cx="23.4" cy="17.4" rx="5.6" ry="3" transform="rotate(-14 23.4 17.4)" className="wl-swallow-belly" />
      <circle cx="27.4" cy="10.2" r="4" className="wl-swallow" />
      <circle cx="29.6" cy="12.4" r="2.3" className="wl-swallow-red" />
      <circle cx="30.4" cy="8.4" r="0.9" className="wl-swallow-red" />
      <Eye x={28.6} y={9.4} r={0.7} c={c} />
      <path d="M31.2 9.6 L33.6 10.3 L31.2 11 Z" className="wl-beak-dark" />
      <Wing sx={24} sy={12.6} c={c}>
        <path d="M25.6 12.2 Q15 13 4.6 19.4 Q15.6 17.2 24 16.8 Z" className="wl-swallow-dark" />
      </Wing>
    </>
  );
}

function Butterfly({ c }: { c: Ctx }) {
  let anim: Anim = NONE;
  if (!c.still) {
    if (c.pose === "fly") anim = { animate: { scaleX: [1, 0.15, 1] }, transition: { duration: 0.32, repeat: Infinity, ease: "easeInOut" } };
    else if (c.excited) anim = { animate: { scaleX: [1, 0.2, 1, 0.2, 1] }, transition: { duration: 0.6 } };
    else if (c.pose === "sleep") anim = { animate: { scaleX: 0.22 }, transition: { duration: 0.8 } };
    else anim = loop(false, { scaleX: [1, 1, 0.3, 1, 1] }, 6 + c.phase, { times: [0, 0.6, 0.7, 0.8, 1] });
  }
  const closed = c.still && c.pose === "sleep" ? 0.22 : 1;
  const half = (
    <>
      <path d="M14 11.6 C15.6 3.4 22.6 0.4 26.6 2.6 C28.2 6.4 25.4 11.2 14 12.4 Z" className="wl-fly-fore" />
      <path d="M14 12.4 C20.6 12 24.6 15.2 23 19.4 C20.2 22.4 16 19.6 14 14 Z" className="wl-fly-hind" />
      <ellipse cx="23.2" cy="5.2" rx="2.6" ry="2.1" className="wl-fly-ring" />
      <ellipse cx="23.2" cy="5.2" rx="1.6" ry="1.3" className="wl-fly-blue" />
      <ellipse cx="23.2" cy="5.2" rx="0.7" ry="0.6" className="wl-fly-dark" />
      <circle cx="20" cy="16.6" r="1.9" className="wl-fly-dark" />
      <circle cx="20" cy="16.6" r="1" className="wl-fly-blue" />
    </>
  );
  return (
    <>
      <motion.g style={at(14, 12)} initial={false} {...anim}>
        <g transform={`translate(14 0) scale(${closed} 1) translate(-14 0)`}>
          {half}
          <g transform="translate(28 0) scale(-1 1)">{half}</g>
        </g>
      </motion.g>
      <path d="M13.6 6.4 Q12.4 2.6 10.6 2 M14.4 6.4 Q15.6 2.6 17.4 2" className="wl-fly-antenna" />
      <ellipse cx="14" cy="12.8" rx="1.05" ry="5.6" className="wl-fly-body" />
      <circle cx="14" cy="6.8" r="1.25" className="wl-fly-body" />
    </>
  );
}

function Hedgehog({ c }: { c: Ctx }) {
  const walking = (c.pose === "walk" || c.pose === "fly") && !c.still;
  const legs = [11, 16, 24, 29];
  // Spiky dome: alternate outer/inner points along a half-ellipse.
  const pts: string[] = [];
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * (1 - i / n) * 0.96 + 0.02;
    const k = i % 2 === 0 ? 1.12 : 1;
    pts.push(`${(18 + Math.cos(a) * 13 * k).toFixed(1)} ${(21 - Math.sin(a) * 10.5 * k).toFixed(1)}`);
  }
  return (
    <>
      <g className="wl-leg-hog">
        {legs.map((x, i) => (
          <motion.rect
            key={i}
            x={x - 1.2}
            y={19.5}
            width={2.4}
            height={4.2}
            rx={1.2}
            {...(walking ? loop(false, { x: i % 2 ? [-0.8, 0.8, -0.8] : [0.8, -0.8, 0.8] }, 0.7, { ease: "linear" }) : NONE)}
          />
        ))}
      </g>
      <path d={`M5 21.2 L${pts.join(" L")} L31 21.2 Q18 23.4 5 21.2 Z`} className="wl-hog-spines" />
      <path d="M9 15 l3 -2.4 M13 11.8 l3 -2 M18 10.6 l3 -1.4 M23 11.6 l2.8 -0.8 M11 18.6 l3 -2 M16 15.8 l3 -1.6 M21 15 l3 -1" className="wl-hog-tips" />
      <path d="M25.4 13.4 Q32.6 13.8 37.4 19 Q33.6 22 25.4 21.6 Z" className="wl-hog-face" />
      <circle cx="28.4" cy="13.8" r="1.6" className="wl-hog-face" />
      <circle cx="37.4" cy="19" r="1.15" className="wl-eye" />
      <Eye x={31.2} y={16.4} r={0.85} c={c} />
    </>
  );
}

function Squirrel({ c }: { c: Ctx }) {
  return (
    <>
      <Tail px={16} py={27} c={c} deg={-6}>
        <path
          d="M17 28.4 C7.6 29.4 2.4 21.4 5.2 14.4 C7 9.8 6.2 6.8 3.2 5.4 C8.4 1.8 15.6 5.4 14.2 13 C13.4 17.8 15 22 19 24.6 Z"
          className="wl-sq-tail"
        />
      </Tail>
      <ellipse cx="21" cy="23.2" rx="6" ry="7.6" className="wl-sq" />
      <ellipse cx="23.2" cy="24.4" rx="3.2" ry="5.4" className="wl-sq-belly" />
      <ellipse cx="18.6" cy="27.4" rx="4.6" ry="3.6" className="wl-sq-dark" />
      <path d="M17.4 31.4 h6.4 Q24.6 30 22.4 29.6 h-4 Z" className="wl-sq-dark" />
      <circle cx="24" cy="13.4" r="4.6" className="wl-sq" />
      <path d="M21.4 10.2 L22.2 4.6 L25.4 9.6 Z" className="wl-sq-dark" />
      <ellipse cx="27.8" cy="15" rx="1.9" ry="1.5" className="wl-sq" />
      <circle cx="29.4" cy="14.6" r="0.6" className="wl-eye" />
      <Eye x={25.6} y={12.4} r={0.9} c={c} />
      <path d="M25 19.6 q2.4 -0.4 2.8 1.6 q-1.8 0.8 -2.8 -0.2 Z" className="wl-sq-dark" />
    </>
  );
}

function Robin({ c }: { c: Ctx }) {
  return (
    <>
      <Legs xs={[13.5, 18]} top={21.6} bottom={25.6} c={c} />
      <Tail px={9} py={17.5} c={c} deg={12}>
        <path d="M9.8 15.8 L2.6 20 L3.4 22 L10.6 19.6 Z" className="wl-robin-dark" />
      </Tail>
      <ellipse cx="15" cy="16.6" rx="8.2" ry="6.8" className="wl-robin" />
      <circle cx="21" cy="11" r="5" className="wl-robin" />
      <ellipse cx="18.6" cy="20.4" rx="5.6" ry="3.2" className="wl-robin-belly" />
      <path d="M22.2 11.4 Q25.6 11 25.6 13.6 Q26 18.6 21.4 20.4 Q16.6 21 16.6 17 Q17 12.6 22.2 11.4 Z" className="wl-robin-breast" />
      <Eye x={22.6} y={9.9} r={0.95} c={c} />
      <path d="M25.4 10.4 L28.6 11.2 L25.4 12 Z" className="wl-beak-dark" />
      <Wing sx={15} sy={13} c={c}>
        <path d="M17 13 Q11.4 12.2 8 16.8 Q12.6 19.8 16.6 17.4 Z" className="wl-robin-dark" />
      </Wing>
    </>
  );
}

function Owl({ c }: { c: Ctx }) {
  const wing = (side: 1 | -1) => {
    const sx = side === 1 ? 21 : 7;
    let anim: Anim = NONE;
    if (!c.still) {
      if (c.pose === "fly") anim = { animate: { rotate: [0, -side * 70, 0] }, transition: { duration: 0.5, repeat: Infinity, ease: "easeInOut" } };
      else if (c.excited) anim = { animate: { rotate: [0, -side * 40, 0] }, transition: { duration: 0.6 } };
      else anim = { animate: { rotate: 0 }, transition: { duration: 0.3 } };
    }
    return (
      <motion.g style={at(sx, 14)} {...anim}>
        <ellipse cx={side === 1 ? 21.6 : 6.4} cy="20" rx="3.6" ry="8.2" className="wl-owl-dark" />
        <circle cx={side === 1 ? 21.4 : 6.6} cy="17" r="0.7" className="wl-owl-spot" />
        <circle cx={side === 1 ? 22.4 : 5.6} cy="21" r="0.7" className="wl-owl-spot" />
        <circle cx={side === 1 ? 21 : 7} cy="24.4" r="0.7" className="wl-owl-spot" />
      </motion.g>
    );
  };
  return (
    <>
      {c.pose !== "fly" && (
        <path d="M10.2 30 v1.6 M11.6 30 v1.8 M13 30 v1.6 M15 30 v1.6 M16.4 30 v1.8 M17.8 30 v1.6" className="wl-owl-talon" />
      )}
      <ellipse cx="14" cy="19.6" rx="9.4" ry="11" className="wl-owl" />
      <ellipse cx="14" cy="22.4" rx="5.8" ry="7" className="wl-owl-belly" />
      <path d="M12 19 v2.6 M16 19.4 v2.4 M14 23 v2.6 M11.2 25 v2 M16.8 25.4 v2" className="wl-owl-streak" />
      <ellipse cx="14" cy="10.4" rx="8.6" ry="7.4" className="wl-owl" />
      <circle cx="10.7" cy="10.8" r="3.7" className="wl-owl-disc" />
      <circle cx="17.3" cy="10.8" r="3.7" className="wl-owl-disc" />
      <path d="M7 8.6 Q10.6 5.6 14 9 Q17.4 5.6 21 8.6" className="wl-owl-brow" />
      <Eye x={10.8} y={10.8} r={1.35} c={c} />
      <Eye x={17.2} y={10.8} r={1.35} c={c} />
      <path d="M13 12.2 L15 12.2 L14 14.6 Z" className="wl-owl-beak" />
      {wing(-1)}
      {wing(1)}
    </>
  );
}

const DRAW: Record<Species, (p: { c: Ctx }) => JSX.Element> = {
  wren: Wren,
  bluetit: BlueTit,
  chick: Chick,
  swallow: Swallow,
  butterfly: Butterfly,
  hedgehog: Hedgehog,
  squirrel: Squirrel,
  robin: Robin,
  owl: Owl,
};

const PHASE: Record<Species, number> = {
  wren: 0, bluetit: 0.7, chick: 0.3, swallow: 1.1, butterfly: 0.4, hedgehog: 1.4, squirrel: 0.9, robin: 1.6, owl: 2.2,
};

/** Whole-body movement for a pose. */
function poseAnim(species: Species, pose: Pose, still?: boolean): Anim {
  if (still) return NONE;
  const ground = GROUND.includes(species);
  switch (pose) {
    case "hop":
      return { animate: { y: [0, -3.2, 0] }, transition: { duration: 0.46, repeat: Infinity, repeatDelay: 0.9, ease: "easeOut" } };
    case "walk":
      return ground
        ? { animate: { y: [0, -0.6, 0], rotate: [-1.2, 1.2, -1.2] }, transition: { duration: 0.7, repeat: Infinity, ease: "easeInOut" } }
        : { animate: { y: [0, -2, 0] }, transition: { duration: 0.32, repeat: Infinity, repeatDelay: 0.16, ease: "easeOut" } };
    case "fly":
      if (species === "hedgehog") return poseAnim(species, "walk");
      if (species === "squirrel") return poseAnim(species, "hop");
      return loop(false, { y: [0, -1.4, 0] }, species === "butterfly" ? 1.1 : 0.68);
    case "sleep":
      return loop(false, { scaleY: [1, 1.035, 1], scaleX: [1, 1.01, 1] }, 5.4);
    default:
      return loop(false, { scaleY: [1, 1.022, 1] }, 4.2 + PHASE[species]);
  }
}

export function Critter({
  species,
  size = 32,
  pose = "idle",
  facing = 1,
  still,
  excited,
  title,
}: {
  species: Species;
  size?: number;
  pose?: Pose;
  facing?: 1 | -1;
  still?: boolean;
  excited?: boolean;
  title?: string;
}): JSX.Element {
  const [w, h] = BOX[species];
  const Draw = DRAW[species];
  const c: Ctx = { pose, still, excited, phase: PHASE[species] };
  // Anchor transforms at the feet (or the middle, for the butterfly).
  const ax = w / 2;
  const ay = species === "butterfly" ? h / 2 : h;
  const cheer: Anim = still
    ? NONE
    : excited
      ? { animate: { y: [0, -5, 0, -2.4, 0], rotate: [0, -5, 0, 3, 0] }, transition: { duration: 0.6, ease: "easeOut" } }
      : { animate: { y: 0, rotate: 0 }, transition: { duration: 0.2 } };
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={(size * h) / w}
      className={`wl wl-${species} wl-pose-${pose}`}
      role="img"
      aria-label={title ?? SPECIES_INFO[species].name}
      style={facing === -1 ? { transform: "scaleX(-1)" } : undefined}
    >
      {title && <title>{title}</title>}
      <motion.g style={at(ax, ay)} initial={false} {...cheer}>
        <motion.g style={at(ax, ay)} initial={false} {...poseAnim(species, pose, still)}>
          <Draw c={c} />
        </motion.g>
      </motion.g>
    </svg>
  );
}

/* ---------- nest ---------- */

const NEST_W = 48;
const NEST_H = 28;

export function Nest({ size = 48, eggs = 0, chicks = 0, still }: { size?: number; eggs?: number; chicks?: number; still?: boolean }): JSX.Element {
  const nc = Math.max(0, Math.min(4, Math.round(chicks)));
  const ne = Math.max(0, Math.min(4, Math.round(eggs)));
  const items = [...Array<"chick">(nc).fill("chick"), ...Array<"egg">(ne).fill("egg")];
  const gap = items.length > 5 ? 5 : 6.4;
  const x0 = 24 - ((items.length - 1) * gap) / 2;
  const label =
    [nc ? `${nc} chick${nc > 1 ? "s" : ""}` : "", ne ? `${ne} egg${ne > 1 ? "s" : ""}` : ""].filter(Boolean).join(" and ") || "empty";
  return (
    <svg
      viewBox={`0 0 ${NEST_W} ${NEST_H}`}
      width={size}
      height={(size * NEST_H) / NEST_W}
      className="wl wl-nest"
      role="img"
      aria-label={`A nest, ${label}`}
    >
      <ellipse cx="24" cy="14.4" rx="20" ry="4.6" className="wl-nest-back" />
      <ellipse cx="24" cy="14.6" rx="16.6" ry="3" className="wl-nest-hollow" />
      {items.map((it, i) => {
        const x = x0 + i * gap;
        if (it === "egg") {
          return (
            <g key={`e${i}`}>
              <ellipse cx={x} cy={14} rx="2.5" ry="3.1" className="wl-egg" />
              <circle cx={x - 0.8} cy={13} r="0.4" className="wl-egg-spot" />
              <circle cx={x + 0.9} cy={14.4} r="0.35" className="wl-egg-spot" />
              <circle cx={x} cy={15.8} r="0.35" className="wl-egg-spot" />
            </g>
          );
        }
        return (
          <motion.g
            key={`c${i}`}
            style={at(x, 16)}
            {...loop(still, { y: [0, -1.6, 0] }, 0.9 + (i % 2) * 0.25, { delay: i * 0.22 })}
          >
            <ellipse cx={x} cy={13.4} rx="3.1" ry="3.3" className="wl-chick" />
            <circle cx={x - 0.6} cy={10.4} r="1" className="wl-chick" />
            <circle cx={x - 1.5} cy={12.4} r="0.5" className="wl-eye" />
            <circle cx={x + 1.5} cy={12.4} r="0.5" className="wl-eye" />
            {/* Open beak, pointing up: two mandibles with the bright gape between. */}
            <path d={`M${x - 1.5} 13.4 L${x - 1} 9.6 L${x} 12.6 L${x + 1} 9.6 L${x + 1.5} 13.4 Q${x} 14.6 ${x - 1.5} 13.4 Z`} className="wl-gape" />
          </motion.g>
        );
      })}
      <path d="M3.6 14.4 Q4.8 25.6 24 25.8 Q43.2 25.6 44.4 14.4 Q34 19.6 24 19.4 Q14 19.6 3.6 14.4 Z" className="wl-nest" />
      <path
        d="M6 16.4 Q16 22.6 30 21 M10 21 Q22 25 38 19.6 M18 24.4 Q30 25 41 17.4 M7.6 19 Q12 20.6 16 20.6 M34 23 l6 -3"
        className="wl-twig"
      />
      <path d="M4 14.2 l-2.6 -1.6 M44 14.2 l2.8 -2 M40.6 18.2 l4 0.4" className="wl-twig" />
    </svg>
  );
}
