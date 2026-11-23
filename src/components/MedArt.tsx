import { useId } from "react";
import type { MedLook } from "../lib/medLook";
import { gradientDefs, edgeColor, type Draw, type Paint } from "./medart/kit";
import { blister, capsule, chewable, effervescent, film, globules, gummy, lozenge, softgel, tablet } from "./medart/solids";
import { ampoule, bottle, drops, implant, infusion, measure, pen, pump, syringe, vial } from "./medart/fluids";
import { dispenser, inhaler, jar, nebuliser, patch, ring, sachet, spray, suppository, tea, tube } from "./medart/devices";
import { dressing, extraShapes, gas, kit } from "./medart/extras";

const DRAW: Record<string, Draw> = {
  tablet,
  effervescent,
  film,
  blister,
  capsule,
  softgel,
  gummy,
  chewable,
  lozenge,
  globules,
  bottle,
  drops,
  measure,
  syringe,
  pen,
  vial,
  ampoule,
  infusion,
  pump,
  implant,
  inhaler,
  nebuliser,
  spray,
  patch,
  tube,
  jar,
  dispenser,
  suppository,
  ring,
  sachet,
  tea,
  dressing,
  gas,
  kit,
};

const SHINE: Record<string, number> = { matte: 0, satin: 0.28, glossy: 0.6, pearl: 0.45 };

interface Props {
  look: MedLook;
  size?: number;
  /** Show the back of a tablet. */
  face?: "front" | "back";
  /** A soft shadow underneath (for the big preview). */
  shadow?: boolean;
  className?: string;
  title?: string;
}

/** A medication drawn from its look: any kind, shape, colours and features. */
export function MedArt({ look, size = 48, face = "front", shadow, className, title }: Props) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, "");
  const finish = typeof look.opts.finish === "string" ? look.opts.finish : "satin";
  const p: Paint = {
    look,
    o: look.opts,
    uid: (k) => `ma${raw}${k}`,
    c: look.colors,
    fill: (i) => `url(#ma${raw}lin${i})`,
    dome: (i) => `url(#ma${raw}rad${i})`,
    ink: (i) => edgeColor(look.colors[i] ?? "#cccccc"),
    glass: `url(#ma${raw}glass)`,
    shine: SHINE[finish] ?? 0.28,
    sw: 1.5,
    face,
  };
  const draw = extraShapes[`${look.kind}/${look.shape}`] ?? DRAW[look.kind] ?? tablet;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>{gradientDefs(p.uid, look.colors, finish)}</defs>
      {shadow && <ellipse cx={32} cy={60} rx={17} ry={2.6} fill="#000" opacity={0.1} />}
      <g transform={look.tilt ? `rotate(${look.tilt} 32 32)` : undefined}>{draw(p)}</g>
    </svg>
  );
}
