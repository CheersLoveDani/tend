// Drawing kit for medication art: a 64×64 box, colours per part, and shared bits
// (outlines, shine, liquid, bubbles, text) used by every kind.
import type { ReactNode } from "react";
import { inkOn, lum, shade, type MedLook, type OptValue } from "../../lib/medLook";

export type Pt = [number, number];

export interface Paint {
  look: MedLook;
  o: Record<string, OptValue>;
  /** Unique id for defs in this drawing. */
  uid: (k: string) => string;
  /** Colour of each part. */
  c: string[];
  /** Soft top-lit gradient for a part. */
  fill: (i: number) => string;
  /** Rounded, domed gradient for a part. */
  dome: (i: number) => string;
  /** Outline colour for a part. */
  ink: (i: number) => string;
  /** White glass reflections, laid over clear parts. */
  glass: string;
  /** How strong the highlight is, from the finish. */
  shine: number;
  sw: number;
  /** Which side is being shown (tablets can be flipped in the studio). */
  face: "front" | "back";
}

export type Draw = (p: Paint) => ReactNode;

export const outline = (p: Paint, i: number, w = p.sw): { stroke: string; strokeWidth: number; strokeLinejoin: "round"; strokeLinecap: "round" } => ({
  stroke: p.ink(i),
  strokeWidth: w,
  strokeLinejoin: "round",
  strokeLinecap: "round",
});

export const edgeColor = (hex: string) => (lum(hex) < 0.22 ? shade(hex, 0.32) : shade(hex, -0.5));

export function gradientDefs(uid: (k: string) => string, colors: string[], finish: string): ReactNode {
  const [hi, lo] = finish === "matte" ? [0.12, -0.08] : finish === "glossy" ? [0.3, -0.18] : finish === "pearl" ? [0.36, -0.12] : [0.2, -0.13];
  return (
    <>
      {colors.map((c, i) => (
        <linearGradient key={`l${i}`} id={uid(`lin${i}`)} x1="0.1" y1="0" x2="0.55" y2="1">
          <stop offset="0" stopColor={shade(c, hi)} />
          <stop offset="0.5" stopColor={c} />
          {finish === "pearl" && <stop offset="0.72" stopColor={shade(c, 0.16)} />}
          <stop offset="1" stopColor={shade(c, lo)} />
        </linearGradient>
      ))}
      {colors.map((c, i) => (
        <radialGradient key={`r${i}`} id={uid(`rad${i}`)} cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor={shade(c, hi + 0.12)} />
          <stop offset="0.55" stopColor={c} />
          <stop offset="1" stopColor={shade(c, lo - 0.08)} />
        </radialGradient>
      ))}
      <linearGradient id={uid("glass")} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0.05" />
        <stop offset="0.16" stopColor="#fff" stopOpacity="0.6" />
        <stop offset="0.3" stopColor="#fff" stopOpacity="0.12" />
        <stop offset="0.75" stopColor="#fff" stopOpacity="0" />
        <stop offset="0.9" stopColor="#fff" stopOpacity="0.28" />
        <stop offset="1" stopColor="#fff" stopOpacity="0.05" />
      </linearGradient>
    </>
  );
}

// --- Path helpers ----------------------------------------------------------------------------

const f = (n: number) => Math.round(n * 100) / 100;

export function rrect(x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  return `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)}V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)}H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)}V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}Z`;
}

export function ellipse(cx: number, cy: number, rx: number, ry = rx) {
  return `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;
}

/** A polygon with rounded corners. */
export function roundPoly(pts: Pt[], r: number) {
  const n = pts.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[(i - 1 + n) % n];
    const [x, y] = pts[i];
    const [nx, ny] = pts[(i + 1) % n];
    const l1 = Math.hypot(x - px, y - py);
    const l2 = Math.hypot(nx - x, ny - y);
    const r1 = Math.min(r, l1 / 2) / l1;
    const r2 = Math.min(r, l2 / 2) / l2;
    const a: Pt = [x + (px - x) * r1, y + (py - y) * r1];
    const b: Pt = [x + (nx - x) * r2, y + (ny - y) * r2];
    d += `${i === 0 ? "M" : "L"}${f(a[0])} ${f(a[1])}Q${f(x)} ${f(y)} ${f(b[0])} ${f(b[1])}`;
  }
  return d + "Z";
}

export function regular(n: number, r: number, cx = 32, cy = 32, rot = -90, ry = r): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = ((rot + (360 / n) * i) * Math.PI) / 180;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * ry] as Pt;
  });
}

export function starPts(points: number, outer: number, inner: number, cx = 32, cy = 32): Pt[] {
  return Array.from({ length: points * 2 }, (_, i) => {
    const a = ((-90 + (180 / points) * i) * Math.PI) / 180;
    const r = i % 2 ? inner : outer;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as Pt;
  });
}

/** A closed curve from a radius for each angle. */
export function polar(r: (t: number) => number, cx = 32, cy = 32, n = 120) {
  let d = "";
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const rr = r(t);
    d += `${i ? "L" : "M"}${f(cx + Math.cos(t) * rr)} ${f(cy + Math.sin(t) * rr)}`;
  }
  return d + "Z";
}

/** Small stable random numbers, so speckles don't jump around between draws. */
export function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// --- Shared pieces ---------------------------------------------------------------------------

/** Several shapes outlined as one: a thick outline pass, then the fills on top. */
export function Union({ parts, fill, stroke, sw, opacity }: { parts: string[]; fill: string; stroke: string; sw: number; opacity?: number }) {
  return (
    <g>
      {parts.map((d, i) => (
        <path key={`o${i}`} d={d} fill={stroke} stroke={stroke} strokeWidth={sw * 2} strokeLinejoin="round" />
      ))}
      <g opacity={opacity}>
        {parts.map((d, i) => (
          <path key={`f${i}`} d={d} fill={fill} />
        ))}
      </g>
    </g>
  );
}

/** A soft white highlight. */
export function Shine({ cx, cy, rx, ry, rot = -20, o }: { cx: number; cy: number; rx: number; ry: number; rot?: number; o: number }) {
  if (o <= 0) return null;
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fff" opacity={o} transform={`rotate(${rot} ${cx} ${cy})`} />;
}

/** A vertical glass glint. */
export function Glint({ x, y, h, o = 0.55, w = 2.2 }: { x: number; y: number; h: number; o?: number; w?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={w / 2} fill="#fff" opacity={o} />;
}

export function Clip({ id, d, children }: { id: string; d: string | string[]; children: ReactNode }) {
  return (
    <>
      <clipPath id={id}>{(Array.isArray(d) ? d : [d]).map((x, i) => <path key={i} d={x} />)}</clipPath>
      <g clipPath={`url(#${id})`}>{children}</g>
    </>
  );
}

/** Liquid filling a container: everything below the level, with a little lit surface. */
export function Liquid({ p, id, d, top, bottom, level, color, x0 = 0, x1 = 64 }: { p: Paint; id: string; d: string; top: number; bottom: number; level: number; color: string; x0?: number; x1?: number }) {
  if (level <= 0) return null;
  const y = bottom - (bottom - top) * Math.min(1, level);
  return (
    <Clip id={p.uid(id)} d={d}>
      <rect x={x0} y={y} width={x1 - x0} height={bottom - y + 2} fill={color} />
      <rect x={x0} y={y} width={x1 - x0} height={1.4} fill={shade(color, 0.35)} opacity={0.8} />
      <rect x={x0} y={y + 1.4} width={x1 - x0} height={bottom - y} fill={`url(#${p.uid("glass")})`} opacity={0.35} />
    </Clip>
  );
}

export function Bubbles({ seed, x, y, w, h, n = 6, color = "#fff", o = 0.8 }: { seed: string; x: number; y: number; w: number; h: number; n?: number; color?: string; o?: number }) {
  const r = seeded(seed);
  return (
    <g fill="none" stroke={color} strokeWidth={0.8} opacity={o}>
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} cx={x + r() * w} cy={y + r() * h} r={0.8 + r() * 1.6} />
      ))}
    </g>
  );
}

export function Dots({ seed, x, y, w, h, n, color, rMin = 0.5, rMax = 1.1, o = 1 }: { seed: string; x: number; y: number; w: number; h: number; n: number; color: string; rMin?: number; rMax?: number; o?: number }) {
  const r = seeded(seed);
  return (
    <g fill={color} opacity={o}>
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} cx={x + r() * w} cy={y + r() * h} r={rMin + r() * (rMax - rMin)} />
      ))}
    </g>
  );
}

/** Short text sized to fit a width, for imprints and labels. */
export function Label({ text, x, y, w, color, size = 9, rotate, weight = 800, under }: { text: string; x: number; y: number; w: number; color: string; size?: number; rotate?: number; weight?: number; under?: string }) {
  const t = text.trim();
  if (!t) return null;
  const fs = Math.min(size, (w / Math.max(1, t.length)) * 1.6);
  const common = {
    x,
    textAnchor: "middle" as const,
    dominantBaseline: "central" as const,
    fontSize: fs,
    fontWeight: weight,
    fontFamily: "var(--font-body)",
    letterSpacing: 0.2,
    transform: rotate ? `rotate(${rotate} ${x} ${y})` : undefined,
  };
  return (
    <g>
      {under && (
        <text {...common} y={y + 0.55} fill={under} opacity={0.55}>
          {t}
        </text>
      )}
      <text {...common} y={y} fill={color}>
        {t}
      </text>
    </g>
  );
}

/** Text pressed into a surface (debossed) or printed on it. */
export function Imprint({ text, x, y, w, base, size = 9, printed, ink }: { text: string; x: number; y: number; w: number; base: string; size?: number; printed?: boolean; ink?: string }) {
  if (printed) return <Label text={text} x={x} y={y} w={w} size={size} color={ink ?? inkOn(base)} />;
  return <Label text={text} x={x} y={y} w={w} size={size} color={shade(base, lum(base) < 0.3 ? 0.3 : -0.32)} under={shade(base, 0.6)} />;
}

export const text = (v: OptValue | undefined) => (typeof v === "string" ? v : "");
export const num = (v: OptValue | undefined, d: number) => (typeof v === "number" ? v : d);
export const on = (v: OptValue | undefined) => v === true;
export const SIZE: Record<string, number> = { s: 0.72, m: 0.86, l: 1 };
export const scaleAt = (s: number, cx = 32, cy = 32) => `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`;

/** A falling drop. */
export const dropPath = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r * 1.7}C${cx + r * 0.5} ${cy - r * 0.9} ${cx + r} ${cy - r * 0.3} ${cx + r} ${cy + r * 0.15}A${r} ${r} 0 0 1 ${cx - r} ${cy + r * 0.15}C${cx - r} ${cy - r * 0.3} ${cx - r * 0.5} ${cy - r * 0.9} ${cx} ${cy - r * 1.7}Z`;

/** A clear container: tinted glass with its reflections and outline. */
export function Glass({ p, d, i, tint = 0.35 }: { p: Paint; d: string; i: number; tint?: number }) {
  return (
    <>
      <path d={d} fill={p.c[i]} opacity={tint} />
      <path d={d} fill={p.glass} />
      <path d={d} fill="none" {...outline(p, i)} />
    </>
  );
}

export function Mist({ x, y, dir = -90, spread = 36, len = 14, color = "#a9cde9" }: { x: number; y: number; dir?: number; spread?: number; len?: number; color?: string }) {
  const r = seeded(`mist${x}${y}`);
  return (
    <g fill={color} opacity={0.75}>
      {Array.from({ length: 16 }, (_, i) => {
        const a = ((dir + (r() - 0.5) * spread) * Math.PI) / 180;
        const d = 3 + r() * len;
        return <circle key={i} cx={x + Math.cos(a) * d} cy={y + Math.sin(a) * d} r={0.5 + r() * 0.9} />;
      })}
    </g>
  );
}

/** Where a point a little way from the centre *on screen* lands inside the turned drawing,
 *  so shine stays top-left and edges stay underneath whatever the turn. */
export function local(p: Paint, dx: number, dy: number): Pt {
  const t = (p.look.tilt * Math.PI) / 180;
  return [32 + dx * Math.cos(t) + dy * Math.sin(t), 32 - dx * Math.sin(t) + dy * Math.cos(t)];
}

/** Offset that points straight down on screen, for an item's thickness. */
export function down(p: Paint, by: number): Pt {
  const [x, y] = local(p, 0, by);
  return [x - 32, y - 32];
}

/** Shine fixed to the top-left on screen. */
export function ScreenShine({ p, dx, dy, rx, ry, o }: { p: Paint; dx: number; dy: number; rx: number; ry: number; o: number }) {
  const [x, y] = local(p, dx, dy);
  return <Shine cx={x} cy={y} rx={rx} ry={ry} rot={-25 - p.look.tilt} o={o} />;
}
