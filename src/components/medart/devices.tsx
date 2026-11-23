// Inhalers, nebulisers, sprays, patches, tubes, pots, pumps, suppositories, rings, powders, teas.
import { inkOn, shade } from "../../lib/medLook";
import { Clip, Dots, Glass, Glint, Label, Liquid, Mist, Shine, ScreenShine, ellipse, on, outline, rrect, scaleAt, text, type Draw, type Paint } from "./kit";

const Counter = ({ x, y, p }: { x: number; y: number; p: Paint }) =>
  on(p.o.counter) ? (
    <g>
      <rect x={x} y={y} width={8} height={5.5} rx={1.5} fill="#fff" stroke={shade(p.c[0], -0.45)} strokeWidth={0.6} />
      <text x={x + 4} y={y + 2.9} textAnchor="middle" dominantBaseline="central" fontSize={3.6} fontWeight={800} fill="#3a4248" fontFamily="var(--font-body)">
        120
      </text>
    </g>
  ) : null;

function Tag({ p, i, x, y, w, h }: { p: Paint; i: number; x: number; y: number; w: number; h: number }) {
  if (!on(p.o.label)) return null;
  const t = text(p.o.labelText);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={p.c[i]} />
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

// --- Inhalers --------------------------------------------------------------------------------

export const inhaler: Draw = (p) => {
  const { o, look } = p;
  const cap = on(o.cap);
  switch (look.shape) {
    case "disc":
      return (
        <g>
          <path d={rrect(26, 49, 12, 8, 2)} fill={p.fill(2)} {...outline(p, 2)} />
          <circle cx={32} cy={31} r={21} fill={p.fill(0)} {...outline(p, 0)} />
          <circle cx={32} cy={31} r={14} fill={shade(p.c[0], 0.18)} stroke={shade(p.c[0], -0.3)} strokeWidth={0.8} />
          <path d="M18 18A19 19 0 0 1 32 12" fill="none" stroke={p.c[1]} strokeWidth={4} strokeLinecap="round" />
          <circle cx={44} cy={20} r={3} fill={p.fill(1)} stroke={p.ink(1)} strokeWidth={0.8} />
          <Counter x={28} y={36} p={p} />
          <Shine cx={24} cy={20} rx={7} ry={2.5} o={0.4} />
        </g>
      );
    case "turbo":
      return (
        <g>
          <path d={rrect(25, 8, 14, 40, 6)} fill={p.fill(0)} {...outline(p, 0)} />
          <path d={rrect(23, 44, 18, 14, 3)} fill={p.fill(2)} {...outline(p, 2)} />
          {[26, 29, 32, 35, 38].map((x) => (
            <path key={x} d={`M${x} 45.5V56.5`} stroke={shade(p.c[2], -0.35)} strokeWidth={0.8} />
          ))}
          {cap && <path d={rrect(24, 6, 16, 30, 6.5)} fill={p.fill(1)} {...outline(p, 1)} />}
          <Counter x={28} y={37} p={p} />
          <Glint x={27} y={10} h={26} o={0.4} w={1.6} />
        </g>
      );
    case "mist":
      return (
        <g>
          <path d={rrect(24, 44, 16, 14, 4)} fill={p.c[2]} opacity={0.4} {...outline(p, 2)} />
          <path d={rrect(24, 44, 16, 14, 4)} fill={p.glass} />
          <path d={rrect(22, 16, 20, 32, 9)} fill={p.fill(0)} {...outline(p, 0)} />
          {cap ? (
            <path d={rrect(22, 6, 20, 18, 9)} fill={p.fill(1)} {...outline(p, 1)} />
          ) : (
            <path d={rrect(28, 10, 8, 8, 3)} fill={p.fill(0)} {...outline(p, 0)} />
          )}
          <Counter x={28} y={30} p={p} />
          <Glint x={24.5} y={19} h={24} o={0.4} w={1.6} />
        </g>
      );
    case "flat":
      return (
        <g>
          <path d={rrect(10, 18, 44, 28, 12)} fill={p.fill(0)} {...outline(p, 0)} />
          {cap ? <path d="M34 18H42A12 12 0 0 1 42 46H34Z" fill={p.fill(1)} {...outline(p, 1)} /> : <path d={rrect(47, 27, 9, 10, 3)} fill={p.fill(2)} {...outline(p, 2)} />}
          <path d={rrect(16, 22, 10, 3, 1.5)} fill="#fff" opacity={0.45} />
          <Counter x={20} y={36} p={p} />
        </g>
      );
    case "spacer":
      return (
        <g>
          <path d={rrect(4, 28, 9, 8, 2)} fill={p.fill(2)} {...outline(p, 2)} />
          <path d={rrect(10, 21, 36, 22, 11)} fill={p.c[2]} opacity={0.3} {...outline(p, 2)} />
          <path d={rrect(10, 21, 36, 22, 11)} fill={p.glass} />
          <path d={rrect(46, 8, 9, 20, 3)} fill={p.fill(1)} {...outline(p, 1)} />
          <path d={rrect(43, 24, 15, 16, 4)} fill={p.fill(0)} {...outline(p, 0)} />
          {on(o.cap) && <Mist x={44} y={32} dir={180} spread={50} len={20} color={shade(p.c[2], -0.2)} />}
        </g>
      );
    default: {
      const body = "M27 20H47V45C47 48.5 45 50.5 41.5 50.5H19C16.5 50.5 15 49 15 46.5V41C15 39 16.5 37.5 18.5 37.5H27Z";
      return (
        <g>
          <path d={rrect(30.5, 5, 13, 28, 4.5)} fill={p.fill(1)} {...outline(p, 1)} />
          <Glint x={32.5} y={8} h={18} o={0.5} w={1.6} />
          <path d={body} fill={p.fill(0)} {...outline(p, 0)} />
          {cap ? <path d={rrect(11, 36.5, 9, 15, 3)} fill={p.fill(2)} {...outline(p, 2)} /> : <Mist x={14} y={44} dir={180} spread={40} color={shade(p.c[0], -0.15)} />}
          <Counter x={35} y={41} p={p} />
          <path d="M29 23V34" stroke="#fff" strokeWidth={1.4} strokeLinecap="round" opacity={0.4} />
        </g>
      );
    }
  }
};

// --- Nebulisers ------------------------------------------------------------------------------

export const nebuliser: Draw = (p) => {
  const { o, look } = p;
  const mist = on(o.mist);
  if (look.shape === "nebules") {
    return (
      <g>
        {[18, 32, 46].map((x, i) => {
          const body = rrect(x - 6, 21, 12, 34, 5);
          return (
            <g key={x}>
              <Liquid p={p} id={`nb${i}`} d={body} top={21} bottom={55} level={0.62} color={p.c[1]} />
              <Glass p={p} d={body} i={0} tint={0.5} />
              <path d={`M${x - 2} 21V17H${x + 2}V21`} fill={p.c[0]} {...outline(p, 0, p.sw * 0.8)} />
              <path d={rrect(x - 4.5, 7, 9, 10, 2)} fill={p.fill(0)} {...outline(p, 0)} />
              <rect x={x - 2.5} y={10} width={5} height={1.6} fill={p.c[2]} />
            </g>
          );
        })}
        <path d="M24 30H26M38 30H40" stroke={p.ink(0)} strokeWidth={0.8} />
      </g>
    );
  }
  if (look.shape === "mask") {
    const mask = "M32 8C41 8 48 18 48 30C48 42 42 48 32 48C22 48 16 42 16 30C16 18 23 8 32 8Z";
    return (
      <g>
        <path d="M4 30C8 27 13 27 17 28M47 28C51 27 56 27 60 30" fill="none" stroke={p.c[2]} strokeWidth={2} strokeLinecap="round" />
        <path d={mask} fill={p.c[0]} opacity={0.5} {...outline(p, 0)} />
        <path d={mask} fill={p.glass} />
        {mist && <Mist x={32} y={40} dir={-90} spread={70} len={18} color={shade(p.c[1], -0.15)} />}
        <path d={rrect(26, 47, 12, 12, 3)} fill={p.c[0]} opacity={0.6} {...outline(p, 0)} />
        <Liquid p={p} id="nm" d={rrect(26, 47, 12, 12, 3)} top={47} bottom={59} level={0.5} color={p.c[1]} />
      </g>
    );
  }
  const cup = "M22 30H42L40 52C40 55 37 57 34 57H30C27 57 24 55 24 52Z";
  return (
    <g>
      <Liquid p={p} id="nc" d={cup} top={30} bottom={57} level={0.35} color={p.c[1]} />
      <Glass p={p} d={cup} i={0} tint={0.4} />
      <path d={rrect(20, 25, 24, 6, 2)} fill={p.fill(2)} {...outline(p, 2)} />
      <path d={rrect(6, 15, 52, 9, 4.5)} fill={p.fill(0)} {...outline(p, 0)} />
      <path d={rrect(28, 21, 8, 5, 1)} fill={p.fill(0)} {...outline(p, 0)} />
      {mist && <Mist x={6} y={19} dir={180} spread={50} len={10} color={shade(p.c[1], -0.15)} />}
    </g>
  );
};

// --- Sprays ----------------------------------------------------------------------------------

export const spray: Draw = (p) => {
  const { o, look } = p;
  const cap = on(o.cap);
  const mist = on(o.mist);
  const mini = look.shape === "mini";
  const body = mini ? rrect(25, 33, 14, 25, 4) : rrect(22, 30, 20, 29, 5);
  const top = mini ? 33 : 30;
  if (look.shape === "nasal") {
    return (
      <g>
        <path d={body} fill={p.fill(0)} {...outline(p, 0)} />
        <Glint x={24.5} y={33} h={22} o={0.45} />
        <Tag p={p} i={3} x={22} y={38} w={20} h={13} />
        <path d={rrect(15, 26, 34, 5, 2.5)} fill={p.fill(1)} {...outline(p, 1)} />
        <path d="M28 26V14C28 11 30 8 32 6C34 8 36 11 36 14V26Z" fill={p.fill(1)} {...outline(p, 1)} />
        {cap && <path d={rrect(26.5, 4, 11, 23, 5)} fill={p.fill(2)} {...outline(p, 2)} />}
        {!cap && mist && <Mist x={32} y={5} dir={-90} />}
      </g>
    );
  }
  const throat = look.shape === "throat";
  return (
    <g>
      <path d={body} fill={p.fill(0)} {...outline(p, 0)} />
      <Glint x={mini ? 27 : 24.5} y={top + 3} h={mini ? 18 : 22} o={0.45} />
      <Tag p={p} i={3} x={mini ? 25 : 22} y={top + 8} w={mini ? 14 : 20} h={mini ? 10 : 13} />
      <path d={rrect(mini ? 27 : 26, top - 4, mini ? 10 : 12, 5, 1.5)} fill={p.fill(1)} {...outline(p, 1)} />
      {cap ? (
        <path d={rrect(mini ? 25 : 24, top - 18, mini ? 14 : 16, 16, 4)} fill={p.fill(2)} {...outline(p, 2)} />
      ) : (
        <>
          <path d={rrect(mini ? 28 : 27, top - 12, mini ? 8 : 10, 9, 2.5)} fill={p.fill(1)} {...outline(p, 1)} />
          {throat ? (
            <path d={`M28 ${top - 8}C22 ${top - 8} 16 ${top - 12} 12 ${top - 18}`} fill="none" stroke={p.ink(1)} strokeWidth={5} strokeLinecap="round" />
          ) : null}
          {throat ? (
            <path d={`M28 ${top - 8}C22 ${top - 8} 16 ${top - 12} 12 ${top - 18}`} fill="none" stroke={p.c[1]} strokeWidth={3.2} strokeLinecap="round" />
          ) : (
            <path d={rrect(14, top - 10, 14, 4, 2)} fill={p.fill(1)} {...outline(p, 1)} />
          )}
          {mist && (throat ? <Mist x={11} y={top - 20} dir={-130} /> : <Mist x={13} y={top - 8} dir={180} />)}
        </>
      )}
    </g>
  );
};

// --- Patches ---------------------------------------------------------------------------------

const PATCH: Record<string, [string, string, number, number]> = {
  square: [rrect(10, 10, 44, 44, 7), rrect(18, 18, 28, 28, 5), 54, 10],
  round: [ellipse(32, 32, 22), ellipse(32, 32, 13), 47.5, 16.5],
  rectangle: [rrect(6, 16, 52, 32, 6), rrect(16, 22, 32, 20, 4), 58, 16],
  oval: [ellipse(32, 32, 25, 17), ellipse(32, 32, 14, 9), 50, 19.5],
  plaster: [rrect(4, 22, 56, 20, 9), rrect(22, 24, 20, 16, 2), 55, 23],
  clear: [rrect(10, 10, 44, 44, 7), rrect(18, 18, 28, 28, 5), 54, 10],
};

export const patch: Draw = (p) => {
  const { o, look } = p;
  const [d, pad, cx, cy] = PATCH[look.shape] ?? PATCH.square;
  const clear = look.shape === "clear";
  const t = text(o.imprint);
  return (
    <g>
      <path d={d} transform="translate(0 1.5)" fill="#000" opacity={0.08} />
      {clear ? <Glass p={p} d={d} i={0} tint={0.25} /> : <path d={d} fill={p.fill(0)} {...outline(p, 0)} />}
      {look.shape === "plaster" && <Dots seed="plaster" x={6} y={24} w={14} h={16} n={10} color={shade(p.c[0], -0.25)} rMin={0.6} rMax={0.6} />}
      {look.shape === "plaster" && <Dots seed="plaster2" x={44} y={24} w={14} h={16} n={10} color={shade(p.c[0], -0.25)} rMin={0.6} rMax={0.6} />}
      {on(o.pad) && <path d={pad} fill={p.fill(1)} stroke={shade(p.c[1], -0.3)} strokeWidth={0.8} />}
      {t && <Label text={t} x={32} y={32} w={look.shape === "round" ? 20 : 26} size={7} color={p.c[2]} />}
      {on(o.peel) && (
        <g>
          <path d={`M${cx - 12} ${cy}L${cx} ${cy + 12}L${cx - 4} ${cy + 4}Z`} fill="#000" opacity={0.12} />
          <path d={`M${cx - 12} ${cy}Q${cx - 4} ${cy + 1} ${cx} ${cy + 12}Q${cx - 9} ${cy + 9} ${cx - 12} ${cy}Z`} fill={shade(p.c[0], 0.45)} stroke={p.ink(0)} strokeWidth={p.sw * 0.8} strokeLinejoin="round" />
        </g>
      )}
    </g>
  );
};

// --- Tubes -----------------------------------------------------------------------------------

export const tube: Draw = (p) => {
  const { o, look } = p;
  const eye = look.shape === "eye";
  const squeeze = on(o.squeeze);
  const t = text(o.labelText);
  const body = eye ? "M14 25H38C40 25 42 27 44 29V35C42 37 40 39 38 39H14Z" : "M9 19H40C44 19 47 23 49 26V38C47 41 44 45 40 45H9Z";
  const crimp = eye ? rrect(10, 24, 4.5, 16, 1) : rrect(4, 18, 5.5, 28, 1);
  const g = (
    <g>
      <path d={body} fill={p.fill(0)} {...outline(p, 0)} />
      <Clip id={p.uid("tb")} d={body}>
        {on(o.stripe) && <rect x={eye ? 16 : 13} y={0} width={eye ? 4 : 6} height={64} fill={p.c[2]} />}
        {squeeze && !eye && <path d="M30 19C32 26 30 36 33 45" stroke={shade(p.c[0], -0.25)} strokeWidth={1.2} fill="none" opacity={0.5} />}
        <rect x={0} y={eye ? 26.5 : 21.5} width={64} height={eye ? 2 : 3} fill="#fff" opacity={0.45} />
      </Clip>
      <path d={crimp} fill={shade(p.c[0], -0.08)} {...outline(p, 0)} />
      {Array.from({ length: eye ? 4 : 6 }, (_, i) => (
        <path key={i} d={`M${eye ? 10.8 : 4.8} ${(eye ? 26 : 21) + i * (eye ? 3.5 : 4.3)}h${eye ? 3 : 4}`} stroke={shade(p.c[0], -0.35)} strokeWidth={0.6} />
      ))}
      {t && <Label text={t} x={eye ? 29 : 30} y={32} w={eye ? 14 : 20} size={eye ? 6 : 8} color={inkOn(p.c[0])} />}
      {eye ? (
        squeeze ? (
          <>
            <path d="M44 30H54L56 31.5V32.5L54 34H44Z" fill="#fff" {...outline(p, 0, p.sw * 0.8)} />
            <path d="M56 32C59 30 61 32 60 34C59 35.5 57 35 56 33" fill={p.c[3]} stroke={shade(p.c[3], -0.35)} strokeWidth={0.7} />
          </>
        ) : (
          <path d={rrect(44, 28, 14, 8, 2)} fill={p.fill(1)} {...outline(p, 1)} />
        )
      ) : (
        <>
          <rect x={48.5} y={28} width={4.5} height={8} fill={shade(p.c[0], -0.05)} {...outline(p, 0)} />
          {squeeze ? (
            <path d="M53 30C57 26 62 29 60.5 32.5C63 35 59.5 39 55.5 36.5C54.5 35.5 53 35 53 34Z" fill={p.c[3]} stroke={shade(p.c[3], -0.35)} strokeWidth={0.8} />
          ) : look.shape === "flip" ? (
            <>
              <path d={rrect(52, 22, 10, 20, 3)} fill={p.fill(1)} {...outline(p, 1)} />
              <path d="M57 22V42" stroke={shade(p.c[1], -0.35)} strokeWidth={0.7} />
            </>
          ) : (
            <>
              <path d={rrect(52.5, 25.5, 8.5, 13, 2)} fill={p.fill(1)} {...outline(p, 1)} />
              {[54.5, 56.8, 59].map((x) => (
                <path key={x} d={`M${x} 27V37`} stroke={shade(p.c[1], -0.3)} strokeWidth={0.6} />
              ))}
            </>
          )}
        </>
      )}
    </g>
  );
  return look.shape === "big" ? <g transform={scaleAt(1.08)}>{g}</g> : g;
};

// --- Pots ------------------------------------------------------------------------------------

export const jar: Draw = (p) => {
  const { o, look } = p;
  const open = on(o.open);
  const tall = look.shape === "tub";
  const tin = look.shape === "tin";
  const top = tall ? 24 : tin ? 34 : 32;
  const bottom = tin ? 48 : 57;
  const base = `M12 ${top}H52V${bottom - 4}C52 ${bottom - 1} 49 ${bottom} 46 ${bottom}H18C15 ${bottom} 12 ${bottom - 1} 12 ${bottom - 4}Z`;
  return (
    <g>
      {open && <path d={rrect(34, top - 24, 26, 10, 4)} fill={p.fill(1)} {...outline(p, 1)} transform={`rotate(18 47 ${top - 19})`} />}
      <path d={base} fill={p.fill(0)} {...outline(p, 0)} />
      <Clip id={p.uid("jb")} d={base}>
        <rect x={14} y={top} width={2.5} height={bottom - top} fill="#fff" opacity={0.4} />
      </Clip>
      {!tin && <Tag p={p} i={3} x={12} y={top + (bottom - top) * 0.3} w={40} h={Math.min(13, (bottom - top) * 0.45)} />}
      {tin && on(o.label) && text(o.labelText) && <Label text={text(o.labelText)} x={32} y={41} w={30} size={7} color={inkOn(p.c[0])} />}
      {open ? (
        <g>
          <ellipse cx={32} cy={top} rx={20} ry={4.5} fill={p.c[0]} {...outline(p, 0)} />
          <ellipse cx={32} cy={top + 0.5} rx={17.5} ry={3.4} fill={p.c[2]} />
          <path d={`M26 ${top}C28 ${top - 4} 36 ${top - 4} 36 ${top - 1}C36 ${top + 1} 31 ${top + 1} 31 ${top - 1}`} fill="none" stroke={shade(p.c[2], -0.15)} strokeWidth={1.2} strokeLinecap="round" />
        </g>
      ) : (
        <g>
          <path d={rrect(10, top - (tin ? 8 : 11), 44, tin ? 10 : 12, 3)} fill={p.fill(1)} {...outline(p, 1)} />
          {!tin && Array.from({ length: 13 }, (_, i) => <path key={i} d={`M${13 + i * 3.2} ${top - 9.5}v9`} stroke={shade(p.c[1], -0.3)} strokeWidth={0.6} opacity={0.7} />)}
          <rect x={14} y={top - (tin ? 6.5 : 9.5)} width={34} height={1.6} rx={0.8} fill="#fff" opacity={0.45} />
        </g>
      )}
    </g>
  );
};

// --- Pumps, foams, roll-ons ------------------------------------------------------------------

export const dispenser: Draw = (p) => {
  const { look } = p;
  switch (look.shape) {
    case "foam":
      return (
        <g>
          <path d={rrect(21, 22, 22, 37, 4)} fill={p.fill(0)} {...outline(p, 0)} />
          <path d="M21 26C21 19 26 15.5 32 15.5C38 15.5 43 19 43 26Z" fill={p.fill(0)} {...outline(p, 0)} />
          <Glint x={24} y={26} h={30} o={0.55} />
          <Tag p={p} i={2} x={21} y={34} w={22} h={14} />
          <path d={rrect(27, 8, 10, 9, 2)} fill={p.fill(1)} {...outline(p, 1)} />
          <path d={rrect(19, 9, 9, 3.5, 1.7)} fill={p.fill(1)} {...outline(p, 1)} />
        </g>
      );
    case "rollon":
      return (
        <g>
          <path d="M22 31C22 27 25 25 28 25H36C39 25 42 27 42 31V54C42 57 39 59 36 59H28C25 59 22 57 22 54Z" fill={p.fill(0)} {...outline(p, 0)} />
          <Tag p={p} i={2} x={22} y={36} w={20} h={14} />
          <path d={rrect(24, 21, 16, 6, 2)} fill={p.fill(1)} {...outline(p, 1)} />
          <circle cx={32} cy={17} r={6.5} fill="#e4ecef" stroke="#7d8d85" strokeWidth={p.sw} />
          <circle cx={29.5} cy={14.5} r={2} fill="#fff" opacity={0.85} />
        </g>
      );
    case "dropper":
      return (
        <g>
          <path d={rrect(21, 30, 22, 29, 5)} fill={p.fill(0)} {...outline(p, 0)} />
          <Glint x={23.5} y={33} h={22} o={0.5} />
          <Tag p={p} i={2} x={21} y={38} w={22} h={13} />
          <path d={rrect(25, 24, 14, 7, 2)} fill={p.fill(1)} {...outline(p, 1)} />
          <path d="M28 24V16C28 11 30 8 32 8C34 8 36 11 36 16V24Z" fill={p.dome(1)} {...outline(p, 1)} />
        </g>
      );
    case "shampoo":
      return (
        <g>
          <path d="M20 22C20 18 23 16 27 16H37C41 16 44 18 44 22V55C44 57.5 42 59 39.5 59H24.5C22 59 20 57.5 20 55Z" fill={p.fill(0)} {...outline(p, 0)} />
          <Glint x={22.5} y={20} h={34} o={0.4} />
          <Tag p={p} i={2} x={20} y={30} w={24} h={16} />
          <path d={rrect(23, 8, 18, 9, 3)} fill={p.fill(1)} {...outline(p, 1)} />
          <path d="M23 12H41" stroke={shade(p.c[1], -0.35)} strokeWidth={0.7} />
        </g>
      );
    default:
      return (
        <g>
          <path d={rrect(20, 28, 24, 31, 6)} fill={p.fill(0)} {...outline(p, 0)} />
          <Glint x={22.5} y={31} h={24} o={0.45} />
          <Tag p={p} i={2} x={20} y={36} w={24} h={14} />
          <path d={rrect(25, 22, 14, 7, 2)} fill={p.fill(1)} {...outline(p, 1)} />
          <rect x={30} y={14} width={4} height={9} fill={p.fill(1)} {...outline(p, 1, p.sw * 0.8)} />
          <path d={rrect(24, 9, 16, 6, 2)} fill={p.fill(1)} {...outline(p, 1)} />
          <path d={rrect(12, 10, 13, 3.5, 1.7)} fill={p.fill(1)} {...outline(p, 1)} />
        </g>
      );
  }
};

// --- Suppositories and pessaries -------------------------------------------------------------

const SUPP: Record<string, string> = {
  bullet: "M10 25H38C48 25 56 29 57.5 32C56 35 48 39 38 39H10C8.3 39 7 37.7 7 36V28C7 26.3 8.3 25 10 25Z",
  torpedo: "M8 32C8 27 14 24 24 24H40C50 24 57 29 58 32C57 35 50 40 40 40H24C14 40 8 37 8 32Z",
  pessary: "M32 10C41 10 46 20 46 32C46 46 40 54 32 54C24 54 18 46 18 32C18 20 23 10 32 10Z",
};

export const suppository: Draw = (p) => {
  const { o, look } = p;
  if (look.shape === "applicator") {
    return (
      <g>
        <rect x={42} y={30} width={14} height={4} fill={p.fill(1)} {...outline(p, 1, p.sw * 0.8)} />
        <path d={rrect(54, 26, 4, 12, 1.5)} fill={p.fill(1)} {...outline(p, 1, p.sw * 0.8)} />
        <path d={rrect(12, 26.5, 31, 11, 5)} fill={p.c[1]} opacity={0.55} {...outline(p, 1)} />
        <path d={rrect(12, 26.5, 31, 11, 5)} fill={p.glass} />
        <path d={rrect(40, 24, 3, 16, 1.5)} fill={p.fill(1)} {...outline(p, 1, p.sw * 0.8)} />
        <path d="M5 32C5 27.5 9 26 14 26.5V37.5C9 38 5 36.5 5 32Z" fill={p.dome(0)} {...outline(p, 0)} />
      </g>
    );
  }
  if (look.shape === "enema") {
    const body = "M14 32C14 24 20 20 28 20H36C44 20 50 24 50 32V50C50 55 46 58 41 58H23C18 58 14 55 14 50Z";
    return (
      <g>
        <path d="M29 20V7C29 5 30.5 4 32 4C33.5 4 35 5 35 7V20Z" fill={p.fill(1)} {...outline(p, 1)} />
        <path d={body} fill={p.fill(0)} {...outline(p, 0)} />
        <Glint x={17} y={26} h={26} o={0.45} />
      </g>
    );
  }
  const d = SUPP[look.shape] ?? SUPP.bullet;
  return (
    <g>
      <path d={d} transform="translate(0 1.6)" fill="#000" opacity={0.08} />
      <path d={d} fill={p.dome(0)} {...outline(p, 0)} />
      <Clip id={p.uid("sp")} d={d}>
        <ScreenShine p={p} dx={-6} dy={-5} rx={10} ry={2.4} o={p.shine} />
        {on(o.foil) && (
          <g>
            <rect x={0} y={0} width={look.shape === "pessary" ? 64 : 30} height={look.shape === "pessary" ? 34 : 64} fill={p.fill(1)} transform={look.shape === "pessary" ? "translate(0 30)" : undefined} />
            {[6, 12, 18, 24].map((x) => (
              <path key={x} d={look.shape === "pessary" ? `M${x + 12} 34L${x + 16} 60` : `M${x} 20L${x + 3} 44`} stroke="#fff" strokeWidth={0.8} opacity={0.6} />
            ))}
          </g>
        )}
      </Clip>
      <path d={d} fill="none" {...outline(p, 0)} />
    </g>
  );
};

// --- Rings and IUDs --------------------------------------------------------------------------

export const ring: Draw = (p) => {
  const { o, look } = p;
  const clear = on(o.clear);
  if (look.shape === "iud") {
    const arms = "M14 22C14 17 22 16 32 17C42 16 50 17 50 22";
    return (
      <g>
        <path d="M32 50C30 54 34 56 31 61M32 50C34 54 30 57 34 62" fill="none" stroke={p.c[1]} strokeWidth={1} strokeLinecap="round" />
        <path d={arms} fill="none" stroke={p.ink(0)} strokeWidth={5} strokeLinecap="round" />
        <path d="M32 17V50" stroke={p.ink(0)} strokeWidth={5} strokeLinecap="round" />
        <path d={arms} fill="none" stroke={p.c[0]} strokeWidth={3} strokeLinecap="round" />
        <path d="M32 17V50" stroke={p.c[0]} strokeWidth={3} strokeLinecap="round" />
        <path d={rrect(28.5, 23, 7, 20, 3)} fill={p.c[0]} opacity={clear ? 0.7 : 1} {...outline(p, 0)} />
        <rect x={30} y={25} width={1.4} height={16} rx={0.7} fill="#fff" opacity={0.6} />
      </g>
    );
  }
  return (
    <g>
      <circle cx={32} cy={33.5} r={19} fill="none" stroke="#000" strokeWidth={7} opacity={0.08} />
      <circle cx={32} cy={32} r={19} fill="none" stroke={p.ink(0)} strokeWidth={8.6} />
      <circle cx={32} cy={32} r={19} fill="none" stroke={p.c[0]} strokeWidth={6.4} opacity={clear ? 0.75 : 1} />
      <path d="M17 24A17 17 0 0 1 26 15.5" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" opacity={0.65} />
      <path d="M46 42A17 17 0 0 1 40 47" fill="none" stroke={shade(p.c[0], -0.3)} strokeWidth={1.4} strokeLinecap="round" opacity={0.5} />
    </g>
  );
};

// --- Powders ---------------------------------------------------------------------------------

function zigzag(x0: number, x1: number, y0: number, y1: number, tooth = 3) {
  let d = `M${x0} ${y0}`;
  const n = Math.max(2, Math.round((x1 - x0) / tooth));
  const step = (x1 - x0) / n;
  for (let i = 1; i <= n; i++) d += `L${x0 + step * (i - 0.5)} ${y0 - 1.6}L${x0 + step * i} ${y0}`;
  d += `L${x1} ${y1}`;
  for (let i = n - 1; i >= 0; i--) d += `L${x0 + step * (i + 0.5)} ${y1 + 1.6}L${x0 + step * i} ${y1}`;
  return d + "Z";
}

export const sachet: Draw = (p) => {
  const { o, look } = p;
  const t = text(o.labelText);
  const torn = on(o.torn);
  switch (look.shape) {
    case "scoop":
      return (
        <g>
          <path d={rrect(38, 31, 22, 5, 2.5)} fill={p.fill(0)} {...outline(p, 0)} />
          <path d="M12 31C15 21 23 18 26 18C30 18 38 21 41 31Z" fill={p.dome(1)} stroke={shade(p.c[1], -0.35)} strokeWidth={p.sw * 0.8} />
          <Dots seed="sc" x={14} y={20} w={26} h={10} n={20} color={shade(p.c[1], -0.2)} rMin={0.3} rMax={0.6} />
          <path d="M12 30H41V38C41 44 36 48 30 48H23C17 48 12 44 12 38Z" fill={p.fill(0)} {...outline(p, 0)} />
          <Shine cx={18} cy={36} rx={2} ry={6} rot={0} o={0.4} />
        </g>
      );
    case "pile":
      return (
        <g>
          <path d="M6 52C12 36 22 26 32 26C42 26 52 36 58 52Z" fill={p.c[1]} stroke={shade(p.c[1], -0.35)} strokeWidth={p.sw * 0.8} />
          <Clip id={p.uid("pl")} d="M6 52C12 36 22 26 32 26C42 26 52 36 58 52Z">
            <Dots seed="pile" x={6} y={26} w={52} h={26} n={110} color={shade(p.c[1], -0.25)} rMin={0.5} rMax={1.1} />
            <Dots seed="pile2" x={6} y={26} w={52} h={26} n={50} color={shade(p.c[1], 0.4)} rMin={0.4} rMax={0.9} />
          </Clip>
          <Dots seed="spill" x={4} y={52} w={56} h={5} n={14} color={p.c[1]} rMin={0.5} rMax={1} />
        </g>
      );
    case "tub":
      return (
        <g>
          <path d={rrect(16, 24, 32, 34, 4)} fill={p.fill(0)} {...outline(p, 0)} />
          <path d={rrect(14, 15, 36, 10, 3)} fill={p.fill(2)} {...outline(p, 2)} />
          <rect x={16} y={32} width={32} height={16} fill={p.c[1]} opacity={0.9} />
          <Label text={t} x={32} y={40} w={26} size={8} color={inkOn(p.c[1])} />
          <Glint x={18} y={27} h={28} o={0.4} />
        </g>
      );
    default: {
      const stick = look.shape === "stick";
      const [x0, x1, y0, y1] = stick ? [25, 39, torn ? 12 : 5, 59] : [13, 51, torn ? 14 : 8, 56];
      const body = zigzag(x0, x1, y0, y1);
      return (
        <g>
          {torn && (
            <g>
              <path d={zigzag(x0, x1, y0 - 9, y0 - 3)} transform={`rotate(14 ${x1} ${y0})`} fill={p.fill(0)} {...outline(p, 0, p.sw * 0.8)} />
              <Dots seed="torn" x={x0 + 2} y={y0 - 5} w={x1 - x0 - 4} h={5} n={18} color={p.c[1]} rMin={0.5} rMax={1} />
            </g>
          )}
          <path d={body} fill={p.fill(0)} {...outline(p, 0)} />
          {on(o.stripe) && <rect x={x0} y={stick ? 20 : y0 + 10} width={x1 - x0} height={stick ? 10 : 8} fill={p.c[2]} />}
          {torn && <ellipse cx={(x0 + x1) / 2} cy={y0 + 1} rx={(x1 - x0) / 2 - 2} ry={2} fill={p.c[1]} />}
          <Label text={t} x={(x0 + x1) / 2} y={stick ? 40 : 38} w={stick ? 10 : 30} size={stick ? 6 : 9} rotate={stick ? -90 : undefined} color={inkOn(p.c[0])} />
          <rect x={x0 + 2} y={y0 + 2} width={2} height={y1 - y0 - 4} rx={1} fill="#fff" opacity={0.4} />
        </g>
      );
    }
  }
};

// --- Tea and herbal --------------------------------------------------------------------------

export const tea: Draw = (p) => {
  const { o, look } = p;
  const steam = on(o.steam);
  const Steam = ({ x, y }: { x: number; y: number }) =>
    steam ? (
      <g fill="none" stroke="#9aa5ad" strokeWidth={1.4} strokeLinecap="round" opacity={0.7}>
        <path d={`M${x - 6} ${y}c-3 -4 3 -6 0 -10`} />
        <path d={`M${x} ${y - 1}c-3 -4 3 -6 0 -10`} />
        <path d={`M${x + 6} ${y}c-3 -4 3 -6 0 -10`} />
      </g>
    ) : null;
  if (look.shape === "mug") {
    return (
      <g>
        <Steam x={29} y={17} />
        <path d="M44 28C52 28 52 42 44 42" fill="none" stroke={p.ink(0)} strokeWidth={5.6} />
        <path d="M44 28C52 28 52 42 44 42" fill="none" stroke={p.c[0]} strokeWidth={3.4} />
        <path d="M14 22H44V48C44 54 40 58 34 58H24C18 58 14 54 14 48Z" fill={p.fill(0)} {...outline(p, 0)} />
        <ellipse cx={29} cy={22} rx={15} ry={3.4} fill={p.c[1]} {...outline(p, 0, p.sw * 0.8)} />
        <Glint x={17} y={26} h={24} o={0.4} />
      </g>
    );
  }
  if (look.shape === "leaf") {
    const leaf = (a: number, c: string, k: number) => (
      <g key={k} transform={`rotate(${a} 32 50)`}>
        <path d="M32 50C22 40 22 20 32 8C42 20 42 40 32 50Z" fill={c} stroke={shade(c, -0.45)} strokeWidth={p.sw} strokeLinejoin="round" />
        <path d="M32 48V12M32 24L27 19M32 32L37 27M32 40L27 35" stroke={shade(c, -0.3)} strokeWidth={0.8} fill="none" />
      </g>
    );
    return <g>{[leaf(-38, p.c[0], 0), leaf(38, p.c[0], 1), leaf(0, p.c[1], 2)]}</g>;
  }
  return (
    <g>
      <path d="M32 16C32 10 40 6 47 9" fill="none" stroke={p.c[2]} strokeWidth={0.9} />
      <path d={rrect(44, 3, 13, 11, 2)} fill={p.fill(1)} {...outline(p, 1)} transform="rotate(12 50 8)" />
      <path d="M18 22L22 16H42L46 22Z" fill={shade(p.c[0], 0.2)} {...outline(p, 0)} />
      <path d="M18 22H46V54C46 56 44.5 57 43 57H21C19.5 57 18 56 18 54Z" fill={p.fill(0)} {...outline(p, 0)} />
      <Clip id={p.uid("tb")} d="M18 22H46V54C46 56 44.5 57 43 57H21C19.5 57 18 56 18 54Z">
        <Dots seed="tea" x={18} y={22} w={28} h={35} n={70} color={shade(p.c[0], -0.25)} rMin={0.4} rMax={0.8} />
      </Clip>
      <Steam x={56} y={36} />
    </g>
  );
};

