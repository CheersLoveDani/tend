// Tablets, capsules, softgels, gummies, lozenges and other things you swallow or chew.
import { inkOn, shade } from "../../lib/medLook";
import {
  Bubbles,
  Clip,
  Dots,
  Glass,
  Imprint,
  Label,
  Liquid,
  ScreenShine,
  SIZE,
  Shine,
  Union,
  down,
  dropPath,
  ellipse,
  num,
  on,
  outline,
  polar,
  regular,
  roundPoly,
  rrect,
  scaleAt,
  seeded,
  starPts,
  text,
  type Draw,
  type Paint,
} from "./kit";

const sizeOf = (p: Paint) => SIZE[String(p.o.size)] ?? 0.86;

// --- Tablet ----------------------------------------------------------------------------------

/** Each shape: its outline, half width and height, and where text sits best. */
export const TABLET: Record<string, { d: string; w: number; h: number; cy?: number }> = {
  round: { d: ellipse(32, 32, 20), w: 20, h: 20 },
  oval: { d: ellipse(32, 32, 24, 15), w: 24, h: 15 },
  caplet: { d: rrect(8, 21, 48, 22, 10.5), w: 24, h: 11 },
  almond: { d: "M7 32C15 18 49 18 57 32C49 46 15 46 7 32Z", w: 25, h: 10.5 },
  egg: { d: "M32 11C43 11 52 24 52 34C52 46 43 53 32 53C21 53 12 46 12 34C12 24 21 11 32 11Z", w: 20, h: 21, cy: 34 },
  triangle: { d: roundPoly([[32, 10], [56, 51], [8, 51]], 7), w: 23, h: 20, cy: 38 },
  square: { d: rrect(13, 13, 38, 38, 8), w: 19, h: 19 },
  rectangle: { d: rrect(8, 19, 48, 26, 6), w: 24, h: 13 },
  diamond: { d: roundPoly([[32, 12], [57, 32], [32, 52], [7, 32]], 5), w: 25, h: 20 },
  pentagon: { d: roundPoly(regular(5, 22, 32, 33), 4), w: 21, h: 20, cy: 34 },
  hexagon: { d: roundPoly(regular(6, 22, 32, 32, 0), 4), w: 22, h: 19 },
  octagon: { d: roundPoly(regular(8, 21, 32, 32, 22.5), 3), w: 19.5, h: 19.5 },
  heart: { d: "M32 53C14 41 8 31 8 22.5C8 14.5 14 9 21 9C26 9 30 12 32 16C34 12 38 9 43 9C50 9 56 14.5 56 22.5C56 31 50 41 32 53Z", w: 24, h: 22, cy: 27 },
  shield: { d: "M32 9C40 13 47 14 53 14C53 34 46 47 32 55C18 47 11 34 11 14C17 14 24 13 32 9Z", w: 21, h: 23, cy: 29 },
  kidney: { d: "M13 24C16 13 29 12 33 18C36 22 40 22 44 18C51 12 60 21 57 33C53 47 35 52 22 48C10 44 9 33 13 24Z", w: 24, h: 18, cy: 35 },
  teardrop: { d: "M32 8C38 18 50 26 50 38C50 48 42 55 32 55C22 55 14 48 14 38C14 26 26 18 32 8Z", w: 18, h: 23.5, cy: 40 },
  bullet: { d: "M10.5 21.5H40C50 21.5 56.5 27 56.5 32C56.5 37 50 42.5 40 42.5H10.5C8.8 42.5 7.5 41.2 7.5 39.5V24.5C7.5 22.8 8.8 21.5 10.5 21.5Z", w: 24.5, h: 10.5 },
  halfmoon: { d: "M10 40C10 26 20 16 32 16C44 16 54 26 54 40C54 43 52 45 49 45H15C12 45 10 43 10 40Z", w: 22, h: 14.5, cy: 35 },
  trapezoid: { d: roundPoly([[19, 16], [45, 16], [56, 48], [8, 48]], 6), w: 24, h: 16 },
  star: { d: roundPoly(starPts(5, 25, 12, 32, 34), 2.5), w: 24, h: 23, cy: 35 },
  clover: { d: polar((t) => 16.5 + 6 * Math.cos(4 * t + Math.PI)), w: 22, h: 22 },
  flower: { d: polar((t) => 18.5 + 3.5 * Math.cos(6 * t)), w: 22, h: 22 },
  barrel: { d: "M14 17.5C22 14.5 42 14.5 50 17.5C53.5 24 53.5 40 50 46.5C42 49.5 22 49.5 14 46.5C10.5 40 10.5 24 14 17.5Z", w: 21, h: 17 },
  tiny: { d: ellipse(32, 32, 9.5), w: 9.5, h: 9.5 },
};

function groove(d: string, base: string, k: string) {
  return (
    <g key={k} fill="none" strokeLinecap="round">
      <path d={d} stroke={shade(base, -0.5)} strokeWidth={1.9} opacity={0.7} />
      <path d={d} stroke="#fff" strokeWidth={0.9} opacity={0.55} transform="translate(0.9 0.9)" />
    </g>
  );
}

export const tablet: Draw = (p) => {
  const { o, look } = p;
  const s = TABLET[look.shape] ?? TABLET.round;
  const main = p.c[0];
  const front = p.face === "front";
  const score = front ? String(o.score) : "none";
  const imp = text(front ? o.imprint : o.imprintBack).trim();
  const [dx, dy] = down(p, 2.2);
  const domed = o.edge === "domed";
  const mirror = front ? undefined : "translate(64 0) scale(-1 1)";
  const x0 = 32 - s.w;
  const y0 = 32 - s.h;
  const printed = o.inkStyle === "printed";
  const cy = s.cy ?? 32;
  const fs = Math.min(10.5, s.h * 0.75);
  const pattern = String(o.pattern);
  const r = seeded(look.shape + p.c[1]);

  let words = null;
  if (imp) {
    if (score === "line" && imp.length > 1) {
      const half = Math.ceil(imp.length / 2);
      words = (
        <>
          <Imprint text={imp.slice(0, half)} x={32 - s.w * 0.42} y={cy} w={s.w * 0.75} size={fs} base={main} printed={printed} ink={p.c[2]} />
          <Imprint text={imp.slice(half)} x={32 + s.w * 0.42} y={cy} w={s.w * 0.75} size={fs} base={main} printed={printed} ink={p.c[2]} />
        </>
      );
    } else {
      const y = score === "cross" || score === "long" ? cy - s.h * 0.48 : cy;
      words = <Imprint text={imp} x={32} y={y} w={s.w * 1.35} size={score === "cross" || score === "long" ? fs * 0.7 : fs} base={main} printed={printed} ink={p.c[2]} />;
    }
  }

  return (
    <g transform={scaleAt(sizeOf(p))}>
      <g transform={mirror}>
        {/* The tablet's side, peeking out below. */}
        <path d={s.d} transform={`translate(${dx} ${dy})`} fill={shade(main, -0.22)} {...outline(p, 0)} />
        <path d={s.d} fill={domed ? p.dome(0) : p.fill(0)} />
        <Clip id={p.uid("tab")} d={s.d}>
          {pattern === "split" && <rect x={32} y={0} width={32} height={64} fill={p.fill(1)} />}
          {pattern === "layered" && <rect x={0} y={32} width={64} height={32} fill={p.fill(1)} />}
          {pattern === "core" && <path d={s.d} transform={scaleAt(0.42, 32, cy)} fill={p.dome(1)} stroke={shade(p.c[1], -0.25)} strokeWidth={0.8} />}
          {pattern === "speckled" && <Dots seed={look.shape} x={x0} y={y0} w={s.w * 2} h={s.h * 2} n={Math.max(8, Math.round((s.w * s.h) / 8))} color={p.c[1]} />}
          {pattern === "marbled" &&
            [0, 1, 2].map((i) => {
              const y = y0 + s.h * (0.4 + i * 0.6);
              return (
                <path
                  key={i}
                  d={`M${x0 - 2} ${y}C${x0 + s.w * 0.6} ${y - 6 - r() * 6} ${x0 + s.w * 1.2} ${y + 6 + r() * 4} ${x0 + s.w * 2 + 2} ${y - 2}`}
                  fill="none"
                  stroke={p.c[1]}
                  strokeWidth={1.6 + r() * 1.6}
                  opacity={0.6}
                  strokeLinecap="round"
                />
              );
            })}
          {o.edge === "bevel" && (
            <>
              <path d={s.d} fill="none" stroke="#fff" strokeWidth={4.5} opacity={0.22} />
              <path d={s.d} transform={scaleAt(0.86, 32, 32)} fill="none" stroke={shade(main, -0.35)} strokeWidth={0.7} opacity={0.35} />
            </>
          )}
          {domed && <path d={s.d} fill="none" stroke={shade(main, -0.3)} strokeWidth={3} opacity={0.25} />}
          {score === "line" && groove(`M32 ${y0 - 2}V${y0 + s.h * 2 + 2}`, main, "a")}
          {score === "double" && [groove(`M${32 - s.w / 3} 0V64`, main, "a"), groove(`M${32 + s.w / 3} 0V64`, main, "b")]}
          {score === "cross" && [groove("M32 0V64", main, "a"), groove(`M0 ${cy}H64`, main, "b")]}
          {score === "long" && groove(`M0 ${cy}H64`, main, "a")}
          {pattern === "speckled" && null}
          {/* Mirrored twice on the back, so the light still comes from the top left. */}
          <g transform={mirror}>
            <ScreenShine p={p} dx={-s.w * 0.35} dy={-s.h * 0.5} rx={s.w * 0.42} ry={Math.max(2, s.h * 0.2)} o={p.shine + (domed ? 0.12 : 0)} />
          </g>
        </Clip>
        <path d={s.d} fill="none" {...outline(p, 0)} />
      </g>
      {words}
    </g>
  );
};

// --- Fizzy tablets ---------------------------------------------------------------------------

export const effervescent: Draw = (p) => {
  const { o, look } = p;
  const fizz = on(o.fizz);
  if (look.shape === "glass") {
    const glass = "M15 12H49L45.5 55.5C45.3 57.5 44 58.5 42 58.5H22C20 58.5 18.7 57.5 18.5 55.5Z";
    const level = num(o.fill, 75) / 100;
    const top = 14 + (1 - level) * 42;
    return (
      <g>
        <Liquid p={p} id="water" d={glass} top={14} bottom={58} level={level} color={p.c[1]} />
        <ellipse cx={32} cy={52.5} rx={9} ry={2.6} fill={p.fill(0)} stroke={p.ink(0)} strokeWidth={0.9} opacity={0.95} />
        {fizz && level > 0.1 && (
          <Clip id={p.uid("fz")} d={glass}>
            <Bubbles seed="gl" x={21} y={top + 2} w={22} h={50 - top} n={14} />
            <Bubbles seed="gl2" x={20} y={top - 1.5} w={24} h={2.5} n={8} o={0.95} />
          </Clip>
        )}
        <path d={glass} fill={p.glass} />
        <path d={glass} fill="none" stroke={shade(p.c[1], -0.5)} strokeWidth={p.sw} strokeLinejoin="round" />
      </g>
    );
  }
  if (look.shape === "tube") {
    const body = rrect(21, 15, 22, 44, 4);
    return (
      <g>
        <path d={body} fill={p.fill(1)} {...outline(p, 1)} />
        <rect x={21} y={28} width={22} height={17} fill="#fff" opacity={0.85} />
        <Label text="FIZZ" x={32} y={36.5} w={18} size={6} color={shade(p.c[1], -0.4)} />
        <path d={rrect(19, 6, 26, 11, 3)} fill={p.fill(2)} {...outline(p, 2)} />
        {[23, 27, 31, 35, 39].map((x) => (
          <path key={x} d={`M${x + 0.5} 8V15`} stroke={shade(p.c[2], -0.25)} strokeWidth={0.8} />
        ))}
        <Shine cx={25} cy={40} rx={1.3} ry={12} rot={0} o={0.45} />
        {fizz && <Bubbles seed="tube" x={44} y={4} w={14} h={18} n={5} color={shade(p.c[1], -0.35)} />}
      </g>
    );
  }
  const d = ellipse(32, 34, 21);
  const [dx, dy] = down(p, 2);
  return (
    <g>
      <path d={d} transform={`translate(${dx} ${dy})`} fill={shade(p.c[0], -0.2)} {...outline(p, 0)} />
      <path d={d} fill={p.fill(0)} />
      <Clip id={p.uid("ef")} d={d}>
        <Dots seed="eff" x={9} y={10} w={46} h={46} n={34} color={shade(p.c[0], -0.12)} />
        <path d={d} fill="none" stroke="#fff" strokeWidth={4} opacity={0.25} />
      </Clip>
      <path d={d} fill="none" {...outline(p, 0)} />
      <Imprint text={text(o.imprint)} x={32} y={33} w={30} size={10} base={p.c[0]} />
      {fizz && <Bubbles seed="eft" x={8} y={2} w={48} h={8} n={9} color={shade(p.c[1], -0.3)} />}
    </g>
  );
};

// --- Dissolving film -------------------------------------------------------------------------

export const film: Draw = (p) => {
  const { o, look } = p;
  const d = look.shape === "square" ? rrect(15, 15, 34, 34, 4) : look.shape === "round" ? ellipse(32, 32, 18) : look.shape === "wafer" ? rrect(11, 17, 42, 30, 7) : rrect(9, 19, 46, 26, 3);
  const clear = on(o.clear);
  const [dx, dy] = down(p, 1);
  return (
    <g>
      <path d={d} transform={`translate(${dx} ${dy})`} fill={shade(p.c[0], -0.3)} opacity={0.4} />
      <path d={d} fill={p.fill(0)} opacity={clear ? 0.72 : 1} />
      <Clip id={p.uid("film")} d={d}>
        {look.shape === "wafer" &&
          [17, 24, 31, 38, 45, 52].map((x) => <path key={x} d={`M${x} 10L${x - 8} 54`} stroke={shade(p.c[0], -0.2)} strokeWidth={0.7} opacity={0.6} />)}
        <path d="M0 50L50 0H62L12 64Z" fill="#fff" opacity={0.28} />
      </Clip>
      <path d={d} fill="none" {...outline(p, 0, p.sw * 0.9)} />
      <Label text={text(o.imprint)} x={32} y={32} w={28} size={8} color={p.c[1]} />
    </g>
  );
};

// --- Blister pack ----------------------------------------------------------------------------

const GRID: Record<string, [number, number]> = { b6: [2, 3], b8: [2, 4], b10: [2, 5], b14: [2, 7], b21: [3, 7], b28: [4, 7] };

export const blister: Draw = (p) => {
  const { o, look } = p;
  const [rows, cols] = GRID[look.shape] ?? GRID.b10;
  const total = rows * cols;
  const popped = Math.min(total, Math.round(num(o.popped, 0)));
  const cell = Math.min(50 / cols, 38 / rows);
  const w = cell * cols + 6;
  const h = cell * rows + 6 + (on(o.days) ? 5 : 0);
  const x0 = 32 - w / 2;
  const y0 = 32 - h / 2;
  const kind = String(o.pill);
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const foil = p.c[0];
  return (
    <g>
      <path d={rrect(x0, y0, w, h, 3.5)} fill={p.fill(0)} {...outline(p, 0)} />
      <path d={rrect(x0, y0, w, h, 3.5)} fill={p.glass} opacity={0.6} />
      {Array.from({ length: total }, (_, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const cx = x0 + 3 + cell * (c + 0.5);
        const cy = y0 + 3 + (on(o.days) ? 5 : 0) + cell * (r + 0.5);
        const rx = kind === "round" ? cell * 0.36 : cell * 0.44;
        const ry = kind === "round" ? cell * 0.36 : cell * 0.27;
        const pocket = ellipse(cx, cy, rx + 1, ry + 1);
        if (i < popped)
          return (
            <g key={i}>
              <path d={pocket} fill={shade(foil, -0.3)} />
              <path d={`M${cx - rx} ${cy}l${rx / 2} ${-ry / 2}l${rx / 2} ${ry}l${rx / 2} ${-ry}l${rx / 2} ${ry / 2}`} fill="none" stroke={shade(foil, 0.5)} strokeWidth={0.7} />
            </g>
          );
        const pill =
          kind === "capsule" ? (
            <g>
              <path d={rrect(cx - rx, cy - ry, rx, ry * 2, ry)} fill={p.c[2]} />
              <path d={rrect(cx - rx, cy - ry, rx * 2, ry * 2, ry)} fill="none" />
              <path d={`M${cx} ${cy - ry}H${cx + rx - ry}A${ry} ${ry} 0 0 1 ${cx + rx - ry} ${cy + ry}H${cx}Z`} fill={p.c[1]} />
            </g>
          ) : kind === "caplet" ? (
            <path d={rrect(cx - rx, cy - ry, rx * 2, ry * 2, ry * 0.8)} fill={p.c[1]} />
          ) : (
            <path d={ellipse(cx, cy, rx, ry)} fill={p.c[1]} />
          );
        return (
          <g key={i}>
            <path d={pocket} fill="#fff" opacity={0.45} stroke={shade(foil, -0.35)} strokeWidth={0.6} />
            {pill}
            <path d={ellipse(cx, cy, rx, ry)} fill="none" stroke={shade(p.c[1], -0.4)} strokeWidth={0.5} />
            <Shine cx={cx - rx * 0.35} cy={cy - ry * 0.45} rx={rx * 0.35} ry={ry * 0.22} o={0.7} />
          </g>
        );
      })}
      {on(o.days) &&
        Array.from({ length: cols }, (_, c) => (
          <text key={c} x={x0 + 3 + cell * (c + 0.5)} y={y0 + 5.5} textAnchor="middle" fontSize={4} fontWeight={800} fill={inkOn(foil)} fontFamily="var(--font-body)">
            {cols === 7 ? days[c] : c + 1}
          </text>
        ))}
    </g>
  );
};

// --- Capsule ---------------------------------------------------------------------------------

const CAPSULE: Record<string, [number, number]> = { standard: [48, 10.5], long: [54, 9], short: [38, 11.5], tiny: [30, 7.5], big: [56, 12.5] };

export const capsule: Draw = (p) => {
  const { o, look } = p;
  const [L, R] = CAPSULE[look.shape] ?? CAPSULE.standard;
  const x0 = 32 - L / 2;
  const x1 = 32 + L / 2;
  const bx = x0 + L * 0.6;
  const cx = x0 + L * 0.42;
  const rc = R + 0.7;
  const body = `M${bx} ${32 - R}H${x0 + R}A${R} ${R} 0 0 0 ${x0 + R} ${32 + R}H${bx}Z`;
  const cap = `M${cx + 1} ${32 - rc}H${x1 - rc}A${rc} ${rc} 0 0 1 ${x1 - rc} ${32 + rc}H${cx + 1}Q${cx} ${32 + rc} ${cx} ${32 + rc - 1}V${32 - rc + 1}Q${cx} ${32 - rc} ${cx + 1} ${32 - rc}Z`;
  const whole = rrect(x0, 32 - R, L, R * 2, R);
  const shell = String(o.shell);
  const capClear = shell === "clear";
  const bodyClear = shell === "clear" || shell === "halfclear";
  const inside = String(o.inside);
  const [dx, dy] = down(p, 1.6);
  const r = seeded("caps" + look.shape);
  const fillIn = p.c[3];

  const contents = (
    <Clip id={p.uid("cin")} d={[capClear ? whole : body]}>
      {inside === "liquid" ? (
        <>
          <rect x={x0} y={32 - R * 0.1} width={L} height={R * 1.2} fill={fillIn} />
          <rect x={x0} y={32 - R * 0.1} width={L} height={1} fill={shade(fillIn, 0.4)} />
        </>
      ) : inside === "powder" ? (
        <>
          <path d={whole} fill={fillIn} transform={scaleAt(0.94)} />
          <Dots seed="pw" x={x0} y={32 - R} w={L} h={R * 2} n={60} color={shade(fillIn, -0.18)} rMin={0.3} rMax={0.6} />
        </>
      ) : (
        Array.from({ length: Math.round((L * R) / (inside === "minitabs" ? 22 : 9)) }, (_, i) => {
          const rad = inside === "minitabs" ? 2.6 : 1.6 + r() * 0.5;
          const x = x0 + rad + r() * (L - rad * 2);
          const y = 32 - R + rad + r() * (R * 2 - rad * 2);
          const col = i % 3 === 0 ? shade(fillIn, -0.15) : fillIn;
          return <circle key={i} cx={x} cy={y} r={rad} fill={col} stroke={shade(fillIn, -0.4)} strokeWidth={0.4} />;
        })
      )}
    </Clip>
  );

  const capText = text(o.imprint);
  const bodyText = text(o.imprintBack);

  return (
    <g transform={scaleAt(sizeOf(p))}>
      <path d={whole} transform={`translate(${dx} ${dy})`} fill="#000" opacity={0.08} />
      {(capClear || bodyClear) && contents}
      <path d={body} fill={bodyClear ? p.c[1] : p.fill(1)} opacity={bodyClear ? 0.5 : 1} {...outline(p, 1)} />
      {bodyClear && <path d={body} fill={p.glass} />}
      {on(o.stripe) && <rect x={x0 + L * 0.22} y={32 - R} width={2.2} height={R * 2} fill={p.c[2]} opacity={0.9} />}
      <path d={cap} fill={capClear ? p.c[0] : p.fill(0)} opacity={capClear ? 0.5 : 1} {...outline(p, 0)} />
      {capClear && <path d={cap} fill={p.glass} />}
      {on(o.band) && <path d={rrect(cx - 1.4, 32 - rc - 0.5, 4.4, rc * 2 + 1, 1.6)} fill={p.fill(2)} {...outline(p, 2, p.sw * 0.8)} />}
      <Clip id={p.uid("csh")} d={whole}>
        <rect x={x0 + R * 0.6} y={32 - R * 0.72} width={L - R * 1.2} height={R * 0.34} rx={R * 0.17} fill="#fff" opacity={p.shine} />
        <rect x={x0} y={32 + R * 0.55} width={L} height={R} fill="#000" opacity={0.06} />
      </Clip>
      {capText && <Label text={capText} x={(cx + x1) / 2 + 1} y={32} w={L * 0.42} size={R * 0.9} color={inkOn(p.c[0])} />}
      {bodyText && <Label text={bodyText} x={(x0 + bx) / 2 - 1} y={32} w={L * 0.42} size={R * 0.9} color={inkOn(p.c[1])} />}
    </g>
  );
};

// --- Softgel ---------------------------------------------------------------------------------

const SOFTGEL: Record<string, string[]> = {
  oval: [ellipse(32, 32, 22, 14)],
  round: [ellipse(32, 32, 16)],
  oblong: [rrect(7, 21, 50, 22, 11)],
  teardrop: ["M8 32C8 24 16 20 26 20C38 20 50 26 56.5 32C50 38 38 44 26 44C16 44 8 40 8 32Z"],
  twist: [ellipse(27, 32, 18, 13), "M41 28.5L54 30Q57 32 54 34L41 35.5Z"],
  pearl: [ellipse(32, 32, 10)],
  fish: [ellipse(29, 32, 17, 11), "M43 32L56 23Q58 32 56 41Z"],
};

export const softgel: Draw = (p) => {
  const { o, look } = p;
  const parts = SOFTGEL[look.shape] ?? SOFTGEL.oval;
  const clear = on(o.clear);
  const main = parts[0];
  const [dx, dy] = down(p, 1.6);
  return (
    <g transform={scaleAt(sizeOf(p))}>
      {parts.map((d, i) => (
        <path key={i} d={d} transform={`translate(${dx} ${dy})`} fill="#000" opacity={0.08} />
      ))}
      <Union parts={parts} fill={clear ? p.c[1] : p.fill(0)} stroke={p.ink(0)} sw={p.sw} />
      {clear && (
        <>
          {parts.map((d, i) => (
            <path key={i} d={d} fill={p.c[0]} opacity={0.5} />
          ))}
          <path d={main} transform={scaleAt(0.7)} fill={p.dome(1)} opacity={0.9} />
        </>
      )}
      <Clip id={p.uid("sg")} d={parts}>
        {on(o.seam) && <path d="M0 32H64" stroke={shade(p.c[0], 0.45)} strokeWidth={0.9} opacity={0.8} />}
        {look.shape === "fish" && <circle cx={20} cy={29.5} r={1.6} fill={shade(p.c[0], -0.5)} />}
        <ScreenShine p={p} dx={-6} dy={-6} rx={8} ry={3} o={p.shine + 0.1} />
      </Clip>
      <Label text={text(o.imprint)} x={look.shape === "twist" ? 27 : 32} y={32} w={20} size={7} color={inkOn(clear ? p.c[1] : p.c[0])} />
    </g>
  );
};

// --- Gummies ---------------------------------------------------------------------------------

const circle = (x: number, y: number, r: number) => ellipse(x, y, r);

const GUMMY: Record<string, string[]> = {
  bear: [circle(32, 17, 9.5), circle(24, 10, 4), circle(40, 10, 4), ellipse(32, 37, 12, 14), ellipse(20, 31, 4.5, 6.5), ellipse(44, 31, 4.5, 6.5), ellipse(25, 50, 5.5, 5), ellipse(39, 50, 5.5, 5)],
  heart: [TABLET.heart.d],
  star: [roundPoly(starPts(5, 25, 12, 32, 34), 4)],
  ring: ["M32 12A20 20 0 1 1 31.99 12ZM32 23A9 9 0 1 0 32.01 23Z"],
  round: [circle(32, 32, 18)],
  slice: ["M9 40A23 23 0 0 1 55 40Z"],
  cube: [roundPoly([[14, 22], [32, 14], [50, 22], [50, 44], [32, 52], [14, 44]], 4)],
  fish: [ellipse(28, 32, 17, 12), "M41 32L56 21Q59 32 56 43Z"],
  dino: [ellipse(30, 38, 15, 10), ellipse(46, 22, 6, 5), "M42 30Q44 25 46 22L50 25Q47 30 46 33Z", "M17 36Q8 36 5 30Q12 41 20 43Z", rrect(21, 43, 6, 11, 3), rrect(33, 43, 6, 11, 3)],
  berry: [circle(32, 22, 7), circle(24, 29, 7), circle(40, 29, 7), circle(32, 34, 7), circle(25, 41, 6.5), circle(39, 41, 6.5), circle(32, 48, 6)],
};

export const gummy: Draw = (p) => {
  const { o, look } = p;
  const parts = GUMMY[look.shape] ?? GUMMY.bear;
  const clear = on(o.clear);
  const two = on(o.twoTone);
  const [dx, dy] = down(p, 1.8);
  return (
    <g transform={scaleAt(sizeOf(p))}>
      {parts.map((d, i) => (
        <path key={i} d={d} transform={`translate(${dx} ${dy})`} fill="#000" opacity={0.1} fillRule="evenodd" />
      ))}
      <Union parts={parts} fill={p.dome(0)} stroke={p.ink(0)} sw={p.sw} opacity={clear ? 0.86 : 1} />
      <Clip id={p.uid("gm")} d={parts}>
        {two && <rect x={0} y={32} width={64} height={32} fill={p.dome(1)} opacity={clear ? 0.86 : 1} />}
        {look.shape === "slice" && (
          <>
            <path d="M9 40A23 23 0 0 1 55 40" fill="none" stroke={p.c[1]} strokeWidth={3} />
            {[-60, -30, 0, 30, 60].map((a) => (
              <path key={a} d={`M32 40L${32 + Math.sin((a * Math.PI) / 180) * 18} ${40 - Math.cos((a * Math.PI) / 180) * 18}`} stroke={shade(p.c[0], 0.4)} strokeWidth={1.2} />
            ))}
          </>
        )}
        {look.shape === "cube" && <path d="M14 22L32 30L50 22L32 14Z" fill="#fff" opacity={0.25} />}
        {look.shape === "cube" && <path d="M32 30V52" stroke={shade(p.c[0], -0.3)} strokeWidth={0.8} opacity={0.6} />}
        {clear && <path d={parts[0]} transform={scaleAt(0.6)} fill="#fff" opacity={0.18} />}
        {look.shape === "bear" && <ellipse cx={32} cy={39} rx={6} ry={7} fill="#fff" opacity={0.18} />}
        {(look.shape === "fish" || look.shape === "dino") && <circle cx={look.shape === "fish" ? 19 : 47.5} cy={look.shape === "fish" ? 29 : 21} r={1.5} fill={shade(p.c[0], -0.55)} />}
        {on(o.sugar) && <Dots seed="sugar" x={4} y={4} w={56} h={56} n={90} color="#fff" rMin={0.35} rMax={0.75} o={0.9} />}
        <ScreenShine p={p} dx={-7} dy={-9} rx={6} ry={2.4} o={0.45} />
      </Clip>
    </g>
  );
};

// --- Chewable tablets ------------------------------------------------------------------------

const CHEW: Record<string, string[]> = {
  round: [circle(32, 32, 20)],
  square: [rrect(13, 13, 38, 38, 9)],
  flower: [TABLET.flower.d],
  animal: [circle(32, 35, 16), circle(19, 19, 7), circle(45, 19, 7)],
  wafer: [rrect(9, 17, 46, 30, 4)],
};

export const chewable: Draw = (p) => {
  const { o, look } = p;
  const parts = CHEW[look.shape] ?? CHEW.round;
  const [dx, dy] = down(p, 2.2);
  return (
    <g transform={scaleAt(sizeOf(p))}>
      {parts.map((d, i) => (
        <path key={i} d={d} transform={`translate(${dx} ${dy})`} fill={shade(p.c[0], -0.22)} stroke={p.ink(0)} strokeWidth={p.sw} />
      ))}
      <Union parts={parts} fill={p.fill(0)} stroke={p.ink(0)} sw={p.sw} />
      <Clip id={p.uid("ch")} d={parts}>
        {on(o.speckled) && <Dots seed={"chew" + look.shape} x={8} y={8} w={48} h={48} n={45} color={p.c[1]} rMin={0.5} rMax={1.2} />}
        {look.shape === "wafer" &&
          [17, 23, 29, 35, 41, 47].map((x) => <path key={x} d={`M${x} 17V47`} stroke={shade(p.c[0], -0.25)} strokeWidth={0.8} opacity={0.6} />)}
        {look.shape === "animal" && (
          <>
            <circle cx={26} cy={32} r={1.8} fill={shade(p.c[0], -0.5)} />
            <circle cx={38} cy={32} r={1.8} fill={shade(p.c[0], -0.5)} />
            <ellipse cx={32} cy={39} rx={3} ry={2} fill={shade(p.c[0], -0.4)} />
          </>
        )}
        <ScreenShine p={p} dx={-8} dy={-10} rx={8} ry={3} o={p.shine * 0.6} />
      </Clip>
      {look.shape !== "animal" && <Imprint text={text(o.imprint)} x={32} y={32} w={28} size={10} base={p.c[0]} />}
    </g>
  );
};

// --- Lozenges, pastilles, gum and lollipops --------------------------------------------------

const LOZ: Record<string, string> = {
  round: circle(32, 32, 17),
  pastille: circle(32, 32, 15),
  square: rrect(16, 16, 32, 32, 7),
  diamond: roundPoly([[32, 12], [52, 32], [32, 52], [12, 32]], 5),
  oval: ellipse(32, 32, 20, 13),
  triangle: roundPoly([[32, 13], [52, 49], [12, 49]], 8),
  ring: "M32 14A18 18 0 1 1 31.99 14ZM32 25A7 7 0 1 0 32.01 25Z",
  gum: rrect(10, 24, 44, 16, 3),
  lollipop: circle(32, 22, 14),
};

export const lozenge: Draw = (p) => {
  const { o, look } = p;
  const d = LOZ[look.shape] ?? LOZ.round;
  const clear = on(o.clear);
  const lolly = look.shape === "lollipop";
  const cy = lolly ? 22 : 32;
  const wrap = on(o.wrapper) && !lolly;
  const [dx, dy] = down(p, 1.8);
  return (
    <g>
      {lolly && <path d={rrect(30.5, 33, 3, 26, 1.5)} fill={p.fill(1)} {...outline(p, 1, p.sw * 0.8)} />}
      {wrap && (
        <g fill={p.c[1]} opacity={0.85} stroke={p.ink(1)} strokeWidth={p.sw * 0.8} strokeLinejoin="round">
          <path d={`M${look.shape === "gum" ? 12 : 17} 32L4 23L7 32L4 41Z`} />
          <path d={`M${look.shape === "gum" ? 52 : 47} 32L60 23L57 32L60 41Z`} />
        </g>
      )}
      <path d={d} transform={`translate(${dx} ${dy})`} fill="#000" opacity={0.1} fillRule="evenodd" />
      <path d={d} fill={look.shape === "pastille" ? p.dome(0) : p.fill(0)} opacity={clear ? 0.85 : 1} fillRule="evenodd" {...outline(p, 0)} />
      <Clip id={p.uid("lz")} d={d}>
        {clear && <path d={d} transform={scaleAt(0.62, 32, cy)} fill="#fff" opacity={0.2} fillRule="evenodd" />}
        {lolly && <path d={`M32 ${cy}m-9 0a9 9 0 0 1 9 -9a6 6 0 0 1 6 6a4 4 0 0 1 -4 4`} fill="none" stroke="#fff" strokeWidth={1.6} opacity={0.4} />}
        {look.shape === "gum" && <Dots seed="gum" x={10} y={24} w={44} h={16} n={40} color="#fff" o={0.6} rMin={0.3} rMax={0.6} />}
        {on(o.sugar) && <Dots seed="lzs" x={10} y={8} w={44} h={48} n={70} color="#fff" rMin={0.35} rMax={0.75} o={0.85} />}
        <ScreenShine p={p} dx={-6} dy={lolly ? -16 : -7} rx={7} ry={2.6} o={p.shine + 0.15} />
      </Clip>
      {wrap && (
        <g>
          <path d={d} fill={p.c[1]} opacity={0.18} />
          <path d="M0 30L64 22" stroke="#fff" strokeWidth={1} opacity={0.35} />
        </g>
      )}
      <Imprint text={text(o.imprint)} x={32} y={cy} w={look.shape === "ring" ? 16 : 26} size={8} base={p.c[0]} />
    </g>
  );
};

// --- Sugar pills (globules) ------------------------------------------------------------------

export const globules: Draw = (p) => {
  const { o, look } = p;
  const ball = (x: number, y: number, r: number, k: number) => (
    <g key={k}>
      <circle cx={x} cy={y} r={r} fill={p.dome(0)} stroke={p.ink(0)} strokeWidth={p.sw * 0.8} />
      <circle cx={x - r * 0.35} cy={y - r * 0.35} r={r * 0.3} fill="#fff" opacity={0.7} />
    </g>
  );
  const drop = on(o.drop);
  if (look.shape === "vial") {
    const tube = rrect(22, 18, 20, 40, 6);
    return (
      <g>
        <Clip id={p.uid("gv")} d={tube}>
          {Array.from({ length: 18 }, (_, i) => ball(25.5 + (i % 4) * 4.4 + (Math.floor(i / 4) % 2) * 2, 54 - Math.floor(i / 4) * 4.2, 2.3, i))}
        </Clip>
        <Glass p={p} d={tube} i={1} tint={0.3} />
        <path d={rrect(20, 9, 24, 11, 3)} fill={p.fill(2)} {...outline(p, 2)} />
        {drop && <path d={dropPath(50, 14, 3.4)} fill="#8fc9e6" stroke={shade("#8fc9e6", -0.45)} strokeWidth={0.8} />}
      </g>
    );
  }
  if (look.shape === "cube") {
    return (
      <g>
        <path d="M14 24L32 15L50 24V44L32 53L14 44Z" fill={p.fill(0)} {...outline(p, 0)} />
        <path d="M14 24L32 33L50 24L32 15Z" fill="#fff" opacity={0.45} />
        <path d="M32 33V53" stroke={p.ink(0)} strokeWidth={p.sw * 0.8} />
        <path d="M32 33L50 24V44L32 53Z" fill="#000" opacity={0.07} />
        <Dots seed="cube" x={14} y={15} w={36} h={38} n={60} color={shade(p.c[0], -0.12)} rMin={0.3} rMax={0.6} />
        {drop && <path d={dropPath(32, 22, 3.6)} fill="#c9a27a" opacity={0.9} stroke={shade("#c9a27a", -0.45)} strokeWidth={0.8} />}
      </g>
    );
  }
  if (look.shape === "single") return <g>{ball(32, 34, 12, 0)}{drop && <path d={dropPath(32, 14, 3.4)} fill="#8fc9e6" />}</g>;
  const pile: [number, number][] = [[20, 48], [28, 48], [36, 48], [44, 48], [24, 41.5], [32, 41.5], [40, 41.5], [28, 35], [36, 35], [32, 28.5]];
  return (
    <g>
      <ellipse cx={32} cy={52} rx={18} ry={2.5} fill="#000" opacity={0.08} />
      {pile.map(([x, y], i) => ball(x, y, 4.1, i))}
      {drop && <path d={dropPath(32, 18, 3.4)} fill="#8fc9e6" stroke={shade("#8fc9e6", -0.45)} strokeWidth={0.8} />}
    </g>
  );
};
