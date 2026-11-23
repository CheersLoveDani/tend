// Bottles, drops, spoons, syringes, pens, vials, ampoules, infusions, pumps and implants.
import { inkOn, lum, shade } from "../../lib/medLook";
import { Clip, Dots, Glass, Glint, Label, Liquid, Shine, dropPath, ellipse, num, on, outline, rrect, scaleAt, text, type Draw, type Paint } from "./kit";

const ridges = (x0: number, x1: number, y0: number, y1: number, color: string, gap = 2.4) => {
  const out = [];
  for (let x = x0 + gap; x < x1 - 0.5; x += gap) out.push(<path key={x} d={`M${x} ${y0}V${y1}`} stroke={color} strokeWidth={0.7} opacity={0.6} />);
  return <g>{out}</g>;
};

const level = (p: Paint, d = 70) => num(p.o.fill, d) / 100;

function BottleLabel({ p, i, x, y, w, h }: { p: Paint; i: number; x: number; y: number; w: number; h: number }) {
  if (!on(p.o.label)) return null;
  const t = text(p.o.labelText);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={p.c[i]} />
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={shade(p.c[i], -0.3)} strokeWidth={0.6} />
      {t ? (
        <Label text={t} x={x + w / 2} y={y + h / 2} w={w - 4} size={Math.min(8, h * 0.6)} color={inkOn(p.c[i])} />
      ) : (
        <g stroke={shade(p.c[i], -0.35)} strokeWidth={1.1} strokeLinecap="round" opacity={0.7}>
          <path d={`M${x + 3} ${y + h * 0.38}H${x + w - 3}`} />
          <path d={`M${x + 3} ${y + h * 0.66}H${x + w * 0.6}`} />
        </g>
      )}
    </g>
  );
}

// --- Bottles ---------------------------------------------------------------------------------

const BOTTLES: Record<string, { body: string; neck: [number, number, number, number]; cap: [number, number, number, number]; top: number; label: [number, number, number, number] }> = {
  syrup: { body: "M20 25C20 21 23 19 26 19H38C41 19 44 21 44 25V55C44 57 42 59 40 59H24C22 59 20 57 20 55Z", neck: [26, 14, 12, 6], cap: [24.5, 5, 15, 10], top: 19, label: [20, 33, 24, 15] },
  round: { body: "M16 33C16 25 22 21 27 20H37C42 21 48 25 48 33V54C48 57 46 59 43 59H21C18 59 16 57 16 54Z", neck: [27, 15, 10, 6], cap: [25, 7, 14, 9], top: 20, label: [16, 36, 32, 14] },
  tall: { body: "M23 24C23 21 25 19 28 19H36C39 19 41 21 41 24V56C41 58 39.5 59 38 59H26C24.5 59 23 58 23 56Z", neck: [28, 14, 8, 6], cap: [26.5, 5, 11, 10], top: 19, label: [23, 32, 18, 17] },
  flask: { body: "M27 20V28L16 51C14.5 55 17 59 21 59H43C47 59 49.5 55 48 51L37 28V20Z", neck: [27, 15, 10, 6], cap: [25.5, 7, 13, 9], top: 20, label: [20, 44, 24, 10] },
  vial: { body: rrect(25, 24, 14, 34, 5), neck: [27, 21, 10, 4], cap: [24, 12, 16, 10], top: 24, label: [25, 36, 14, 12] },
};

export const bottle: Draw = (p) => {
  const { o, look } = p;
  if (look.shape === "pills") {
    const body = rrect(17, 22, 30, 37, 4);
    const l = level(p);
    return (
      <g>
        <Clip id={p.uid("pb")} d={body}>
          {Array.from({ length: 40 }, (_, i) => {
            const row = Math.floor(i / 5);
            const y = 56 - row * 4.6;
            if (y < 22 + 37 * (1 - l)) return null;
            return <ellipse key={i} cx={20 + (i % 5) * 6 + (row % 2) * 3} cy={y} rx={3.4} ry={2.4} fill={p.c[1]} stroke={shade(p.c[1], -0.4)} strokeWidth={0.5} />;
          })}
        </Clip>
        <Glass p={p} d={body} i={0} tint={0.55} />
        <BottleLabel p={p} i={3} x={17} y={33} w={30} h={15} />
        <path d={rrect(15, 10, 34, 13, 3)} fill={p.fill(2)} {...outline(p, 2)} />
        {ridges(15, 49, 12, 21, shade(p.c[2], -0.3))}
      </g>
    );
  }
  const b = BOTTLES[look.shape] ?? BOTTLES.syrup;
  const [nx, ny, nw, nh] = b.neck;
  const [cx, cy, cw, ch] = b.cap;
  const [lx, ly, lw, lh] = b.label;
  const cup = on(o.cup) && !!o.cup && ["syrup", "round", "tall"].includes(look.shape);
  return (
    <g>
      <Liquid p={p} id="bl" d={b.body} top={b.top + 2} bottom={59} level={level(p)} color={p.c[1]} />
      <Glass p={p} d={b.body} i={0} tint={lum(p.c[0]) > 0.75 ? 0.25 : 0.55} />
      <path d={rrect(nx, ny, nw, nh, 1)} fill={p.c[0]} opacity={0.6} {...outline(p, 0)} />
      <BottleLabel p={p} i={3} x={lx} y={ly} w={lw} h={lh} />
      <path d={rrect(cx, cy, cw, ch, 2)} fill={p.fill(2)} {...outline(p, 2)} />
      {ridges(cx, cx + cw, cy + 1.5, cy + ch - 1.5, shade(p.c[2], -0.3))}
      {cup && (
        <g>
          <path d={`M${cx - 4} ${cy - 3}H${cx + cw + 4}L${cx + cw + 2} ${cy + ch + 2}H${cx - 2}Z`} fill="#fff" opacity={0.55} stroke={shade(p.c[2], -0.4)} strokeWidth={p.sw * 0.8} strokeLinejoin="round" />
          <path d={`M${cx} ${cy + 2}h4M${cx} ${cy + 6}h3M${cx} ${cy + 10}h4`} stroke={shade(p.c[2], -0.4)} strokeWidth={0.7} />
        </g>
      )}
    </g>
  );
};

// --- Drops -----------------------------------------------------------------------------------

export const drops: Draw = (p) => {
  const { o, look } = p;
  const liquid = p.c[2];
  const fall = on(o.falling);
  if (look.shape === "drop") {
    const d = dropPath(32, 37, 15);
    return (
      <g>
        <path d={d} fill={p.dome(2)} {...outline(p, 2)} />
        <Shine cx={26} cy={33} rx={3} ry={6} rot={20} o={0.65} />
        <circle cx={38} cy={45} r={1.6} fill="#fff" opacity={0.5} />
      </g>
    );
  }
  if (look.shape === "pipette") {
    const body = rrect(19, 30, 26, 29, 5);
    return (
      <g>
        <Liquid p={p} id="pp" d={body} top={30} bottom={59} level={level(p, 60)} color={liquid} />
        <rect x={30.5} y={27} width={3} height={28} rx={1.5} fill="#fff" opacity={0.5} stroke={shade(p.c[0], -0.4)} strokeWidth={0.5} />
        <Glass p={p} d={body} i={0} tint={0.55} />
        <BottleLabel p={p} i={3} x={19} y={40} w={26} h={12} />
        <path d={rrect(25, 24, 14, 7, 2)} fill={p.fill(1)} {...outline(p, 1)} />
        <path d="M27.5 24V14C27.5 9 29.5 6 32 6C34.5 6 36.5 9 36.5 14V24Z" fill={p.dome(1)} {...outline(p, 1)} />
        {ridges(27.5, 36.5, 16, 22, shade(p.c[1], -0.35), 2.2)}
      </g>
    );
  }
  if (look.shape === "minim") {
    const body = "M24 28C24 24 27 22 32 22C37 22 40 24 40 28V52C40 56 37 58 32 58C27 58 24 56 24 52Z";
    return (
      <g>
        <Liquid p={p} id="mn" d={body} top={22} bottom={58} level={0.7} color={liquid} />
        <Glass p={p} d={body} i={0} tint={0.3} />
        <path d="M30 22V18H34V22" fill={p.c[0]} {...outline(p, 0)} opacity={0.9} />
        <path d={rrect(26, 6, 12, 12, 2.5)} fill={p.fill(1)} {...outline(p, 1)} />
        <Label text={text(o.labelText)} x={32} y={12} w={10} size={5} color={inkOn(p.c[1])} />
        {fall && <path d={dropPath(48, 52, 2.8)} fill={liquid} stroke={shade(liquid, -0.45)} strokeWidth={0.7} />}
      </g>
    );
  }
  // Squeeze bottle, tip down, a drop on its way.
  const body = "M21 6H43C45 6 46 7.5 46 9.5V30C46 34 42 37 38 37.5H26C22 37 18 34 18 30V9.5C18 7.5 19 6 21 6Z";
  return (
    <g>
      <path d={body} fill={p.fill(0)} {...outline(p, 0)} />
      <Glint x={21} y={9} h={22} o={0.5} />
      <BottleLabel p={p} i={3} x={18} y={13} w={28} h={13} />
      <path d={rrect(25.5, 36.5, 13, 5, 1.5)} fill={p.fill(1)} {...outline(p, 1)} />
      <path d="M28 41.5H36L33 50.5Q32 51.5 31 50.5Z" fill={shade(p.c[0], 0.3)} {...outline(p, 0, p.sw * 0.8)} />
      {fall && <path d={dropPath(32, 58, 3)} fill={p.dome(2)} stroke={shade(liquid, -0.45)} strokeWidth={0.8} />}
    </g>
  );
};

// --- Spoons and measures ---------------------------------------------------------------------

export const measure: Draw = (p) => {
  const { look } = p;
  const l = level(p, 65);
  const liquid = p.c[1];
  if (look.shape === "cup") {
    const cup = "M18 18H46L43 56C42.8 57.5 42 58 40.5 58H23.5C22 58 21.2 57.5 21 56Z";
    return (
      <g>
        <Liquid p={p} id="cp" d={cup} top={18} bottom={58} level={l} color={liquid} />
        <Glass p={p} d={cup} i={0} tint={0.3} />
        <g stroke={shade(p.c[2], -0.1)} strokeWidth={0.9} strokeLinecap="round">
          {[26, 34, 42, 50].map((y) => (
            <path key={y} d={`M${38} ${y}H${42.5 - (y - 18) * 0.07}`} />
          ))}
        </g>
        <path d="M17 18H47" stroke={p.ink(0)} strokeWidth={p.sw * 1.4} strokeLinecap="round" />
      </g>
    );
  }
  if (look.shape === "oralsyringe") {
    const barrel = rrect(26, 14, 12, 34, 2);
    const stop = 16 + 30 * l;
    return (
      <g>
        <rect x={30} y={7} width={4} height={8} rx={1} fill={p.fill(0)} {...outline(p, 0, p.sw * 0.8)} />
        <Clip id={p.uid("os")} d={barrel}>
          <rect x={26} y={14} width={12} height={stop - 14} fill={liquid} />
        </Clip>
        <rect x={29.5} y={stop} width={5} height={58 - stop} fill={p.fill(2)} {...outline(p, 2, p.sw * 0.8)} />
        <rect x={26.3} y={stop} width={11.4} height={3} fill={shade(p.c[2], -0.3)} />
        <Glass p={p} d={barrel} i={0} tint={0.25} />
        <path d={rrect(21, 46, 22, 3, 1.5)} fill={p.fill(0)} {...outline(p, 0, p.sw * 0.8)} />
        <path d={rrect(25, 57, 14, 3.5, 1.5)} fill={p.fill(2)} {...outline(p, 2, p.sw * 0.8)} />
        <g stroke={shade(p.c[0], -0.5)} strokeWidth={0.6}>
          {[18, 22, 26, 30, 34, 38, 42].map((y) => (
            <path key={y} d={`M26 ${y}h${y % 8 === 2 ? 4 : 2.5}`} />
          ))}
        </g>
      </g>
    );
  }
  if (look.shape === "dosespoon") {
    const tube = rrect(27, 22, 10, 36, 4);
    const bowl = ellipse(32, 14, 8, 9);
    return (
      <g>
        <Liquid p={p} id="ds" d={tube} top={22} bottom={58} level={l} color={liquid} />
        <Glass p={p} d={tube} i={0} tint={0.3} />
        <path d={bowl} fill={p.fill(0)} {...outline(p, 0)} />
        <path d={ellipse(32, 14, 5.5, 6.5)} fill={liquid} opacity={l > 0.8 ? 1 : 0.25} />
        <g stroke={shade(p.c[2], -0.1)} strokeWidth={0.8}>
          {[30, 38, 46].map((y) => (
            <path key={y} d={`M27 ${y}h4`} />
          ))}
        </g>
      </g>
    );
  }
  const bowl = ellipse(32, 18, 10.5, 12.5);
  return (
    <g>
      <path d={rrect(30, 28, 4, 31, 2)} fill={p.fill(0)} {...outline(p, 0)} />
      <path d={rrect(29.5, 48, 5, 11, 2.5)} fill={p.fill(2)} {...outline(p, 2, p.sw * 0.8)} />
      <path d={bowl} fill={p.fill(0)} {...outline(p, 0)} />
      {l > 0 && <path d={ellipse(32, 18, 8.5 * Math.sqrt(l), 10.5 * Math.sqrt(l))} fill={liquid} />}
      {l > 0 && <Shine cx={29} cy={14} rx={2.5} ry={1.4} o={0.6} />}
    </g>
  );
};

// --- Syringes --------------------------------------------------------------------------------

const SYR: Record<string, [number, number, number, number]> = { standard: [26, 16, 12, 30], insulin: [28.5, 12, 7, 34], prefilled: [27, 18, 10, 26], big: [23.5, 14, 17, 32] };

export const syringe: Draw = (p) => {
  const { o, look } = p;
  const [bx, by, bw, bh] = SYR[look.shape] ?? SYR.standard;
  const l = level(p);
  const stop = by + bh * Math.max(0.06, l);
  const barrel = rrect(bx, by, bw, bh, 1.5);
  const mid = bx + bw / 2;
  return (
    <g>
      {/* needle */}
      <path d={`M${mid} ${by - 4}V${look.shape === "insulin" ? 6 : 4}`} stroke="#9aa5ad" strokeWidth={1.1} strokeLinecap="round" />
      <path d={`M${mid - 2.5} ${by + 0.5}L${mid - 1.5} ${by - 4.5}H${mid + 1.5}L${mid + 2.5} ${by + 0.5}Z`} fill={shade(p.c[2], 0.2)} stroke={p.ink(2)} strokeWidth={0.8} strokeLinejoin="round" />
      {on(o.needleCap) && <path d={rrect(mid - 2.6, 2, 5.2, by - 5, 2.4)} fill={p.fill(2)} {...outline(p, 2, p.sw * 0.8)} />}
      <Clip id={p.uid("sy")} d={barrel}>
        <rect x={bx} y={by} width={bw} height={stop - by} fill={p.c[0]} />
        <rect x={bx} y={by} width={bw} height={stop - by} fill={p.glass} opacity={0.4} />
      </Clip>
      <rect x={mid - bw * 0.2} y={stop} width={bw * 0.4} height={56 - stop} fill={p.fill(1)} {...outline(p, 1, p.sw * 0.8)} />
      <rect x={bx + 0.3} y={stop} width={bw - 0.6} height={3} fill={shade(p.c[1], -0.45)} />
      <path d={barrel} fill="#fff" opacity={0.15} />
      <path d={barrel} fill={p.glass} />
      <path d={barrel} fill="none" stroke={shade(p.c[0], -0.55)} strokeWidth={p.sw} />
      {on(o.marks) && (
        <g stroke={shade(p.c[0], -0.6)} strokeWidth={0.6}>
          {Array.from({ length: Math.floor(bh / 4) }, (_, i) => (
            <path key={i} d={`M${bx} ${by + 3 + i * 4}h${i % 2 ? 2 : 3.5}`} />
          ))}
        </g>
      )}
      <path d={rrect(bx - (look.shape === "prefilled" ? 7 : 5), by + bh - 1, bw + (look.shape === "prefilled" ? 14 : 10), 3, 1.5)} fill={p.fill(1)} {...outline(p, 1, p.sw * 0.8)} />
      <path d={rrect(mid - bw * 0.5, 55, bw, 3.5, 1.5)} fill={p.fill(1)} {...outline(p, 1, p.sw * 0.8)} />
    </g>
  );
};

// --- Pens ------------------------------------------------------------------------------------

const PEN: Record<string, { x: number; w: number; r: number }> = { insulin: { x: 26, w: 12, r: 4 }, auto: { x: 23, w: 18, r: 7 }, dial: { x: 25, w: 14, r: 4 }, slim: { x: 28, w: 8, r: 3 } };

export const pen: Draw = (p) => {
  const { o, look } = p;
  const s = PEN[look.shape] ?? PEN.insulin;
  const mid = s.x + s.w / 2;
  const cap = on(o.cap);
  const auto = look.shape === "auto";
  const bodyTop = auto ? 14 : 18;
  const bodyBottom = auto ? 52 : 55;
  const t = text(o.labelText);
  return (
    <g>
      {!cap && !auto && (
        <>
          <path d={`M${mid} ${bodyTop}V7`} stroke="#9aa5ad" strokeWidth={1} strokeLinecap="round" />
          <path d={rrect(mid - 3, bodyTop - 4, 6, 5, 1.5)} fill="#e9eef1" stroke="#7d8d85" strokeWidth={0.8} />
        </>
      )}
      <path d={rrect(s.x, bodyTop, s.w, bodyBottom - bodyTop, s.r)} fill={p.fill(0)} {...outline(p, 0)} />
      {on(o.window) && (
        <g>
          <path d={rrect(mid - s.w * 0.25, bodyTop + 5, s.w * 0.5, auto ? 9 : 12, 2)} fill="#d8eef6" stroke={shade(p.c[0], -0.4)} strokeWidth={0.7} />
          <rect x={mid - s.w * 0.25 + 1} y={bodyTop + 6} width={1.2} height={auto ? 7 : 10} rx={0.6} fill="#fff" opacity={0.8} />
        </g>
      )}
      {on(o.band) && <rect x={s.x} y={auto ? 40 : 42} width={s.w} height={3} fill={p.c[3]} stroke={p.ink(3)} strokeWidth={0.6} />}
      {t && <Label text={t} x={mid} y={auto ? 32 : 35} w={18} size={Math.min(6, s.w * 0.55)} rotate={-90} color={inkOn(p.c[0])} />}
      <Glint x={s.x + 1.6} y={bodyTop + 3} h={bodyBottom - bodyTop - 6} o={0.4} w={1.4} />
      {auto ? (
        <>
          <path d={rrect(s.x + 1, 51, s.w - 2, 9, 4.5)} fill={p.fill(2)} {...outline(p, 2)} />
          {cap && <path d={rrect(s.x, 4, s.w, 12, 5)} fill={p.fill(1)} {...outline(p, 1)} />}
        </>
      ) : (
        <>
          <path d={rrect(look.shape === "dial" ? s.x - 0.5 : s.x + 1, 54, look.shape === "dial" ? s.w + 1 : s.w - 2, look.shape === "dial" ? 7 : 5, 2)} fill={p.fill(2)} {...outline(p, 2)} />
          {look.shape === "dial" && ridges(s.x, s.x + s.w, 55.5, 59.5, shade(p.c[2], -0.35), 2)}
          {cap && (
            <g>
              <path d={rrect(s.x - 0.5, 4, s.w + 1, bodyTop - 1, s.r + 0.5)} fill={p.fill(1)} {...outline(p, 1)} />
              <path d={rrect(s.x + s.w - 1, 6, 2, 10, 1)} fill={shade(p.c[1], -0.2)} stroke={p.ink(1)} strokeWidth={0.6} />
            </g>
          )}
        </>
      )}
    </g>
  );
};

// --- Vials and ampoules ----------------------------------------------------------------------

export const vial: Draw = (p) => {
  const { o, look } = p;
  const tall = look.shape === "tall";
  const top = tall ? 18 : 24;
  const body = `M22 ${top + 4}C22 ${top + 1} 24 ${top} 26 ${top}H38C40 ${top} 42 ${top + 1} 42 ${top + 4}V55C42 57.5 40 59 37.5 59H26.5C24 59 22 57.5 22 55Z`;
  const powder = on(o.powder);
  const content = (
    <g>
      {powder ? (
        <Clip id={p.uid("vp")} d={body}>
          <rect x={22} y={49} width={20} height={11} fill={p.c[1]} />
          <Dots seed="vp" x={22} y={49} w={20} h={10} n={30} color={shade(p.c[1], -0.2)} rMin={0.3} rMax={0.6} />
        </Clip>
      ) : (
        <Liquid p={p} id="vl" d={body} top={top} bottom={59} level={level(p, 60)} color={p.c[1]} />
      )}
      <Glass p={p} d={body} i={0} tint={0.25} />
      <BottleLabel p={p} i={3} x={22} y={tall ? 34 : 38} w={20} h={tall ? 16 : 12} />
      <rect x={26} y={top - 6} width={12} height={6.5} fill={p.c[0]} opacity={0.6} {...outline(p, 0)} />
      <path d={rrect(24.5, top - 11, 15, 6.5, 1.5)} fill="#c4ccd2" stroke="#7d8d85" strokeWidth={p.sw * 0.8} />
      <path d={rrect(24, top - 16, 16, 6, 2.5)} fill={p.fill(2)} {...outline(p, 2)} />
    </g>
  );
  return look.shape === "small" ? <g transform={scaleAt(0.8, 32, 44)}>{content}</g> : content;
};

export const ampoule: Draw = (p) => {
  const { o, look } = p;
  const tall = look.shape === "tall";
  const y0 = tall ? 4 : 8;
  const neck = 21.5;
  const bodyTop = 24.5;
  const bottom = 59;
  if (look.shape === "plastic") {
    const body = rrect(24, 22, 16, 37, 5);
    return (
      <g>
        <Liquid p={p} id="ap" d={body} top={22} bottom={59} level={level(p)} color={p.c[1]} />
        <Glass p={p} d={body} i={0} tint={0.45} />
        <path d="M27 6H37V14L34 18V22H30V18L27 14Z" fill={p.fill(0)} {...outline(p, 0)} />
        <path d="M32 8V14" stroke={p.ink(0)} strokeWidth={0.7} />
        <rect x={29.5} y={19} width={5} height={2} fill={p.c[2]} />
      </g>
    );
  }
  const open = look.shape === "open";
  const shape = open
    ? `M24 30C24 27 26 25 28 24.5C29.5 24 30 23 30 21.5L31 20.5L32 22L33 20.5L34 21.5C34 23 34.5 24 36 24.5C38 25 40 27 40 30V54C40 57 37.5 ${bottom} 35 ${bottom}H29C26.5 ${bottom} 24 57 24 54Z`
    : `M24 30C24 27 26 25 28 24.5C29.5 24 30 23 30 ${neck}C30 20 28.5 19 28.5 16C28.5 ${y0 + 3} 30 ${y0} 32 ${y0}C34 ${y0} 35.5 ${y0 + 3} 35.5 16C35.5 19 34 20 34 ${neck}C34 23 34.5 24 36 24.5C38 25 40 27 40 30V54C40 57 37.5 ${bottom} 35 ${bottom}H29C26.5 ${bottom} 24 57 24 54Z`;
  return (
    <g>
      <Liquid p={p} id="am" d={shape} top={bodyTop} bottom={bottom} level={level(p)} color={p.c[1]} />
      <Glass p={p} d={shape} i={0} tint={0.3} />
      {!open && <rect x={29.6} y={20.2} width={4.8} height={2} rx={1} fill={p.c[2]} />}
      {on(o.dots) && !open && <circle cx={32} cy={17} r={1.2} fill={p.c[2]} />}
      {open && <path d={rrect(44, 6, 7, 12, 3)} fill={p.c[0]} opacity={0.4} stroke={p.ink(0)} strokeWidth={p.sw * 0.8} transform="rotate(25 47 12)" />}
    </g>
  );
};

// --- Infusions -------------------------------------------------------------------------------

export const infusion: Draw = (p) => {
  const { o, look } = p;
  const line = on(o.line);
  const t = text(o.labelText);
  if (look.shape === "bottle") {
    const body = rrect(20, 6, 24, 38, 5);
    return (
      <g>
        <Liquid p={p} id="ib" d={body} top={6} bottom={44} level={level(p, 80)} color={p.c[1]} />
        <Glass p={p} d={body} i={0} tint={0.3} />
        <path d={rrect(27, 43, 10, 6, 1.5)} fill={p.c[0]} opacity={0.7} {...outline(p, 0)} />
        <path d={rrect(26, 48, 12, 5, 1.5)} fill={p.fill(2)} {...outline(p, 2)} />
        {line && <path d="M32 53C32 60 42 60 50 58" fill="none" stroke={p.c[2]} strokeWidth={1.4} strokeLinecap="round" />}
        <Label text={t} x={32} y={22} w={18} size={6} color={shade(p.c[1], -0.55)} />
      </g>
    );
  }
  const stand = look.shape === "drip";
  const g = (
    <g>
      {(() => {
        const bag = "M18 10C18 8 19.5 7 21 7H43C44.5 7 46 8 46 10V46C46 50 42 52 38 52H26C22 52 18 50 18 46Z";
        return (
          <>
            <Liquid p={p} id="ia" d={bag} top={10} bottom={52} level={level(p, 80)} color={p.c[1]} />
            <path d={bag} fill={p.c[0]} opacity={0.35} />
            <path d={bag} fill={p.glass} />
            <path d={bag} fill="none" {...outline(p, 0)} />
            <circle cx={32} cy={11} r={2} fill="var(--paper, #fff)" stroke={p.ink(0)} strokeWidth={0.8} />
            <g stroke={shade(p.c[0], -0.5)} strokeWidth={0.6}>
              {[20, 26, 32, 38, 44].map((y) => (
                <path key={y} d={`M42 ${y}h3`} />
              ))}
            </g>
            <Label text={t} x={30} y={30} w={16} size={6} color={shade(p.c[1], -0.55)} />
            <path d={rrect(29.5, 51, 5, 7, 1.5)} fill={p.fill(2)} {...outline(p, 2, p.sw * 0.8)} />
            {line && <path d="M32 58C32 63 44 62 52 60" fill="none" stroke={p.c[2]} strokeWidth={1.4} strokeLinecap="round" />}
          </>
        );
      })()}
    </g>
  );
  if (!stand) return g;
  return (
    <g>
      <path d="M54 4V62M48 62H60M54 6H42" stroke="#9aa5ad" strokeWidth={1.6} strokeLinecap="round" fill="none" />
      <g transform="translate(-4 0) scale(0.92)">{g}</g>
    </g>
  );
};

// --- Pumps and sensors -----------------------------------------------------------------------

export const pump: Draw = (p) => {
  const { look } = p;
  if (look.shape === "pod") {
    return (
      <g>
        <path d={rrect(8, 16, 48, 34, 15)} fill="#fff" opacity={0.75} stroke={shade(p.c[0], -0.2)} strokeWidth={0.8} strokeDasharray="1.5 1.5" />
        <path d={rrect(13, 20, 38, 26, 12)} fill={p.fill(0)} {...outline(p, 0)} />
        <path d={rrect(19, 27, 14, 6, 3)} fill={p.c[1]} stroke={shade(p.c[1], -0.4)} strokeWidth={0.7} />
        <circle cx={42} cy={33} r={3} fill={p.c[2]} stroke={p.ink(2)} strokeWidth={0.7} />
        <Shine cx={24} cy={23.5} rx={8} ry={1.6} rot={0} o={0.45} />
      </g>
    );
  }
  if (look.shape === "sensor") {
    return (
      <g>
        <circle cx={32} cy={32} r={22} fill="#fff" opacity={0.75} stroke={shade(p.c[0], -0.2)} strokeWidth={0.8} strokeDasharray="1.5 1.5" />
        <circle cx={32} cy={32} r={14} fill={p.dome(0)} {...outline(p, 0)} />
        <circle cx={32} cy={32} r={9.5} fill="none" stroke={p.c[2]} strokeWidth={1.4} />
        <circle cx={32} cy={32} r={4} fill={p.c[1]} stroke={shade(p.c[1], -0.4)} strokeWidth={0.7} />
      </g>
    );
  }
  return (
    <g>
      <path d="M40 15C46 10 54 12 54 20C54 30 44 28 46 38C48 48 58 46 58 56" fill="none" stroke="#9aa5ad" strokeWidth={1.4} strokeLinecap="round" />
      <path d={rrect(12, 14, 30, 42, 8)} fill={p.fill(0)} {...outline(p, 0)} />
      <path d={rrect(17, 20, 20, 15, 3)} fill={p.c[1]} stroke={shade(p.c[1], -0.4)} strokeWidth={0.7} />
      <path d="M19.5 31L23 27L26 30L30 24L34.5 28" fill="none" stroke={shade(p.c[1], -0.55)} strokeWidth={1} strokeLinejoin="round" />
      <circle cx={21.5} cy={44} r={3.5} fill={p.fill(2)} stroke={p.ink(2)} strokeWidth={0.8} />
      <circle cx={32.5} cy={44} r={3.5} fill={p.fill(2)} stroke={p.ink(2)} strokeWidth={0.8} />
      <Shine cx={20} cy={17} rx={6} ry={1.4} rot={0} o={0.35} />
    </g>
  );
};

export const implant: Draw = (p) => {
  const { look } = p;
  const rod = (y: number, k: number, x = 10, w = 44) => (
    <g key={k}>
      <path d={rrect(x, y, w, 6, 3)} fill={p.fill(0)} {...outline(p, 0)} />
      <rect x={x + 3} y={y + 1.2} width={w - 6} height={1.3} rx={0.6} fill="#fff" opacity={0.6} />
    </g>
  );
  if (look.shape === "two") return <g>{[rod(24, 0), rod(34, 1, 14)]}</g>;
  if (look.shape === "pellet")
    return (
      <g>
        <path d={rrect(22, 25, 20, 14, 7)} fill={p.fill(0)} {...outline(p, 0)} />
        <Shine cx={28} cy={29} rx={4} ry={1.5} rot={0} o={0.55} />
      </g>
    );
  return rod(29, 0);
};
