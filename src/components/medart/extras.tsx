// Forms from the FDA dosage form list that don't fit the other groups: dressings and wipes,
// medical gases, and boxes, kits and pill organisers.
import { inkOn, shade } from "../../lib/medLook";
import { Clip, Dots, Glass, Glint, Label, Shine, on, outline, rrect, text, type Draw } from "./kit";

export const dressing: Draw = (p) => {
  const { o, look } = p;
  const t = text(o.labelText);
  switch (look.shape) {
    case "swab":
      return (
        <g>
          <path d={rrect(30.5, 16, 3, 40, 1.5)} fill={p.fill(1)} {...outline(p, 1, p.sw * 0.8)} />
          <ellipse cx={32} cy={13} rx={5} ry={7} fill={p.dome(0)} {...outline(p, 0)} />
          <Dots seed="swab" x={27} y={6} w={10} h={14} n={14} color={shade(p.c[0], -0.12)} rMin={0.4} rMax={0.7} />
        </g>
      );
    case "sponge": {
      const d = rrect(12, 20, 40, 26, 6);
      return (
        <g>
          <path d={d} fill={p.fill(0)} {...outline(p, 0)} />
          <Clip id={p.uid("sp")} d={d}>
            <Dots seed="sponge" x={12} y={20} w={40} h={26} n={40} color={shade(p.c[0], -0.25)} rMin={0.6} rMax={1.6} />
          </Clip>
          <path d="M12 26L18 20H52L46 26" fill={shade(p.c[0], 0.25)} {...outline(p, 0, p.sw * 0.8)} />
        </g>
      );
    }
    case "tape":
      return (
        <g>
          <path d="M44 38L58 50L52 56L38 44Z" fill={p.c[0]} {...outline(p, 0, p.sw * 0.8)} />
          <circle cx={30} cy={30} r={18} fill={p.fill(0)} {...outline(p, 0)} />
          <circle cx={30} cy={30} r={9} fill={p.fill(1)} {...outline(p, 1)} />
          <circle cx={30} cy={30} r={6} fill="var(--paper, #fff)" stroke={p.ink(1)} strokeWidth={0.8} />
          <path d="M30 13A17 17 0 0 0 14 26" fill="none" stroke="#fff" strokeWidth={1.4} opacity={0.5} strokeLinecap="round" />
        </g>
      );
    case "wipe":
      return (
        <g>
          <path d={rrect(10, 18, 44, 30, 4)} fill={p.fill(1)} {...outline(p, 1)} />
          <path d="M10 26L54 26" stroke={shade(p.c[1], -0.3)} strokeWidth={0.8} />
          <Label text={t} x={32} y={37} w={36} size={8} color={inkOn(p.c[1])} />
          <path d="M22 18C24 8 40 8 42 18" fill={p.fill(0)} {...outline(p, 0)} />
          <path d="M26 16C30 10 36 12 38 16" fill="none" stroke={shade(p.c[0], -0.2)} strokeWidth={0.8} />
        </g>
      );
    case "poultice":
      return (
        <g>
          <path d="M8 40C8 30 18 26 32 26C46 26 56 30 56 40C56 48 46 52 32 52C18 52 8 48 8 40Z" fill={p.fill(0)} {...outline(p, 0)} />
          <path d="M14 38C18 32 46 32 50 38C46 44 18 44 14 38Z" fill={p.fill(1)} opacity={0.9} />
          <Dots seed="poul" x={16} y={33} w={32} h={9} n={20} color={shade(p.c[1], -0.25)} rMin={0.5} rMax={1} />
        </g>
      );
    default: {
      // Gauze pad / dressing with an island.
      const d = rrect(10, 10, 44, 44, 5);
      return (
        <g>
          <path d={d} transform="translate(0 1.5)" fill="#000" opacity={0.08} />
          <path d={d} fill={p.fill(0)} {...outline(p, 0)} />
          <path d={rrect(18, 18, 28, 28, 3)} fill={p.fill(1)} stroke={shade(p.c[1], -0.3)} strokeWidth={0.8} />
          <Clip id={p.uid("gz")} d={rrect(18, 18, 28, 28, 3)}>
            {[20, 24, 28, 32, 36, 40, 44].map((v) => (
              <g key={v} stroke={shade(p.c[1], -0.15)} strokeWidth={0.6}>
                <path d={`M${v} 18V46`} />
                <path d={`M18 ${v}H46`} />
              </g>
            ))}
          </Clip>
          <Label text={t} x={32} y={50} w={30} size={4.5} color={inkOn(p.c[0])} />
        </g>
      );
    }
  }
};

export const gas: Draw = (p) => {
  const { o, look } = p;
  const t = text(o.labelText);
  if (look.shape === "cannula") {
    return (
      <g>
        <path d="M12 20C8 34 18 48 32 48C46 48 56 34 52 20" fill="none" stroke={p.ink(0)} strokeWidth={4.4} strokeLinecap="round" />
        <path d="M12 20C8 34 18 48 32 48C46 48 56 34 52 20" fill="none" stroke={p.c[0]} strokeWidth={2.6} strokeLinecap="round" />
        <path d="M32 48V60" stroke={p.c[0]} strokeWidth={2.6} strokeLinecap="round" />
        <path d={rrect(24, 40, 16, 7, 3.5)} fill={p.fill(1)} {...outline(p, 1)} />
        <path d="M28 40V35M36 40V35" stroke={p.ink(1)} strokeWidth={3} strokeLinecap="round" />
        <path d="M28 40V35M36 40V35" stroke={p.c[1]} strokeWidth={1.8} strokeLinecap="round" />
      </g>
    );
  }
  const small = look.shape === "canister";
  const body = small ? rrect(22, 22, 20, 36, 8) : rrect(21, 16, 22, 44, 10);
  return (
    <g>
      <path d={body} fill={p.fill(0)} {...outline(p, 0)} />
      <path d={small ? "M22 30C22 25 26 22 32 22C38 22 42 25 42 30Z" : "M21 26C21 20 26 16 32 16C38 16 43 20 43 26Z"} fill={p.fill(1)} {...outline(p, 1)} />
      <Glint x={24} y={small ? 31 : 28} h={small ? 22 : 28} o={0.45} />
      <path d={rrect(28, small ? 14 : 8, 8, 9, 2)} fill="#c4ccd2" stroke="#7d8d85" strokeWidth={p.sw * 0.8} />
      <path d={rrect(small ? 33 : 34, small ? 16 : 10, 10, 4, 2)} fill="#c4ccd2" stroke="#7d8d85" strokeWidth={p.sw * 0.8} />
      {!small && <circle cx={32} cy={8} r={4.5} fill={p.fill(2)} {...outline(p, 2, p.sw * 0.8)} />}
      <Label text={t || (small ? "" : "O₂")} x={32} y={small ? 44 : 42} w={16} size={8} color={inkOn(p.c[0])} />
    </g>
  );
};

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

export const kit: Draw = (p) => {
  const { o, look } = p;
  const t = text(o.labelText);
  if (look.shape === "organiser" || look.shape === "organiser2") {
    const two = look.shape === "organiser2";
    return (
      <g>
        <path d={rrect(3, two ? 16 : 22, 58, two ? 32 : 22, 4)} fill={p.fill(0)} {...outline(p, 0)} />
        {DAYS.map((d, i) => {
          const x = 5 + i * 7.9;
          const lids = two ? [17.5, 33] : [23.5];
          return lids.map((y, r) => {
            const open = on(o.open) && i === 0;
            const lid = r === 0 ? p.c[1] : p.c[2];
            return (
              <g key={`${i}-${r}`}>
                <path d={rrect(x, y, 7, 13.5, 1.6)} fill={open ? shade(p.c[0], -0.2) : lid} opacity={open ? 1 : 0.85} stroke={shade(lid, -0.4)} strokeWidth={0.6} />
                {open && <circle cx={x + 3.5} cy={y + 9} r={1.8} fill="#f4f1ea" stroke="#7d8d85" strokeWidth={0.4} />}
                {open && <path d={rrect(x, y - 8, 7, 7, 1.6)} fill={lid} opacity={0.85} stroke={shade(lid, -0.4)} strokeWidth={0.6} />}
                {!open && (
                  <text x={x + 3.5} y={y + 7.2} textAnchor="middle" dominantBaseline="central" fontSize={4.4} fontWeight={800} fill={inkOn(lid)} fontFamily="var(--font-body)">
                    {d}
                  </text>
                )}
              </g>
            );
          });
        })}
      </g>
    );
  }
  if (look.shape === "kit") {
    return (
      <g>
        <path d={rrect(8, 16, 48, 38, 5)} fill={p.fill(0)} {...outline(p, 0)} />
        <path d={rrect(24, 10, 16, 8, 3)} fill="none" stroke={p.ink(0)} strokeWidth={2.4} />
        <path d="M29 35H35M32 32V38" stroke={p.c[1]} strokeWidth={0} />
        <path d={rrect(26, 26, 12, 18, 1.5)} fill={p.c[1]} />
        <path d={rrect(23, 29, 18, 12, 1.5)} fill={p.c[1]} />
        <Shine cx={18} cy={21} rx={7} ry={1.6} rot={0} o={0.4} />
        <Label text={t} x={32} y={50} w={34} size={5} color={inkOn(p.c[0])} />
      </g>
    );
  }
  // Medicine box (carton), drawn in a little perspective.
  return (
    <g>
      <path d="M12 22L40 22L52 14L24 14Z" fill={shade(p.c[0], 0.2)} {...outline(p, 0)} />
      <path d="M40 22L52 14V44L40 52Z" fill={shade(p.c[0], -0.15)} {...outline(p, 0)} />
      <path d={rrect(12, 22, 28, 30, 0.5)} fill={p.fill(0)} {...outline(p, 0)} />
      <rect x={12} y={30} width={28} height={8} fill={p.c[1]} />
      <Label text={t} x={26} y={45} w={22} size={6.5} color={inkOn(p.c[0])} />
      {!t && <path d="M16 45H34M16 48.5H28" stroke={shade(p.c[0], -0.35)} strokeWidth={1} strokeLinecap="round" />}
    </g>
  );
};

/** Extra shapes for existing kinds: drawn here so the main files stay readable. */
export const extraShapes: Record<string, Draw> = {
  "capsule/cachet": (p) => (
    <g>
      <ellipse cx={32} cy={36} rx={20} ry={9} fill={shade(p.c[0], -0.15)} {...outline(p, 0)} />
      <ellipse cx={32} cy={32} rx={20} ry={9} fill={p.fill(0)} {...outline(p, 0)} />
      <ellipse cx={32} cy={32} rx={13} ry={5.5} fill="none" stroke={shade(p.c[0], -0.2)} strokeWidth={0.8} />
      <ellipse cx={27} cy={29} rx={7} ry={2} fill="#fff" opacity={0.4} />
    </g>
  ),
  "lozenge/pouch": (p) => (
    <g>
      <path d={rrect(12, 22, 40, 20, 8)} transform="translate(0 1.5)" fill="#000" opacity={0.08} />
      <path d={rrect(12, 22, 40, 20, 8)} fill={p.fill(0)} {...outline(p, 0)} />
      <path d={rrect(15, 25, 34, 14, 6)} fill="none" stroke={shade(p.c[0], -0.2)} strokeWidth={0.7} strokeDasharray="1.4 1.4" />
      <Dots seed="pouch" x={16} y={26} w={32} h={12} n={30} color={shade(p.c[0], -0.15)} rMin={0.4} rMax={0.8} />
    </g>
  ),
  "syringe/needlefree": (p) => (
    <g>
      <path d={rrect(20, 6, 24, 44, 10)} fill={p.fill(1)} {...outline(p, 1)} />
      <path d={rrect(26, 48, 12, 10, 3)} fill={p.c[0]} opacity={0.5} {...outline(p, 1)} />
      <path d={rrect(28, 56, 8, 4, 2)} fill={p.fill(2)} {...outline(p, 2, p.sw * 0.8)} />
      <path d={rrect(26, 14, 12, 14, 3)} fill="#d8eef6" stroke={shade(p.c[1], -0.4)} strokeWidth={0.7} />
      <Glint x={23} y={10} h={34} o={0.4} w={1.6} />
    </g>
  ),
  "vial/cartridge": (p) => {
    const body = rrect(26, 10, 12, 46, 2);
    const level = Math.min(1, (typeof p.o.fill === "number" ? p.o.fill : 60) / 100);
    return (
      <g>
        <Clip id={p.uid("ct")} d={body}>
          <rect x={26} y={56 - 42 * level} width={12} height={42 * level} fill={p.c[1]} />
          <rect x={26} y={52} width={12} height={4} fill="#3a4248" />
        </Clip>
        <Glass p={p} d={body} i={0} tint={0.25} />
        <path d={rrect(25, 6, 14, 6, 1.5)} fill={p.fill(2)} {...outline(p, 2)} />
      </g>
    );
  },
  "drops/rinse": (p) => (
    <g>
      <path d="M12 34C12 26 20 22 30 22H40C46 22 50 26 50 32C50 44 42 52 30 52C20 52 12 46 12 34Z" fill={p.fill(0)} {...outline(p, 0)} />
      <path d="M48 28L58 20" stroke={p.ink(0)} strokeWidth={5} strokeLinecap="round" />
      <path d="M48 28L58 20" stroke={p.c[0]} strokeWidth={3} strokeLinecap="round" />
      <path d="M18 30C18 26 24 25 30 25H38" fill="none" stroke="#fff" strokeWidth={1.4} opacity={0.5} strokeLinecap="round" />
      <path d={rrect(26, 16, 12, 7, 2)} fill={p.fill(1)} {...outline(p, 1)} />
    </g>
  ),
  "dispenser/bath": (p) => (
    <g>
      <path d="M18 24C18 18 22 14 28 14H36C42 14 46 18 46 24V54C46 57 43 59 40 59H24C21 59 18 57 18 54Z" fill={p.fill(0)} {...outline(p, 0)} />
      <path d={rrect(26, 6, 12, 9, 2.5)} fill={p.fill(1)} {...outline(p, 1)} />
      <rect x={18} y={30} width={28} height={16} fill={p.c[2]} />
      <circle cx={52} cy={20} r={3} fill="none" stroke="#a9cde9" strokeWidth={0.9} />
      <circle cx={56} cy={28} r={2} fill="none" stroke="#a9cde9" strokeWidth={0.9} />
      <Glint x={21} y={18} h={36} o={0.4} />
    </g>
  ),
  "chewable/bar": (p) => {
    const d = rrect(8, 20, 48, 24, 5);
    return (
      <g>
        <path d={d} transform="translate(0 2)" fill={shade(p.c[0], -0.25)} {...outline(p, 0)} />
        <path d={d} fill={p.fill(0)} {...outline(p, 0)} />
        {[20, 32, 44].map((x) => (
          <path key={x} d={`M${x} 20V44`} stroke={shade(p.c[0], -0.3)} strokeWidth={1.2} opacity={0.6} />
        ))}
        {on(p.o.speckled) && <Dots seed="bar" x={8} y={20} w={48} h={24} n={40} color={p.c[1]} />}
        <rect x={11} y={23} width={42} height={2} rx={1} fill="#fff" opacity={0.35} />
      </g>
    );
  },
  "sachet/beads": (p) => {
    const pts: [number, number][] = [];
    for (let r = 0; r < 4; r++) for (let i = 0; i <= r + 2; i++) pts.push([32 - (r + 2) * 3.6 + i * 7.2, 26 + r * 7]);
    return (
      <g>
        {pts.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={3.4} fill={p.dome(1)} stroke={shade(p.c[1], -0.45)} strokeWidth={0.7} />
            <circle cx={x - 1} cy={y - 1} r={1} fill="#fff" opacity={0.7} />
          </g>
        ))}
      </g>
    );
  },
  "sachet/crystals": (p) => (
    <g>
      {[
        [22, 40, 0],
        [34, 34, 20],
        [44, 44, -15],
        [28, 50, 35],
        [40, 54, 10],
      ].map(([x, y, a], i) => (
        <g key={i} transform={`rotate(${a} ${x} ${y})`}>
          <path d={`M${x} ${y - 8}L${x + 6} ${y - 2}L${x + 4} ${y + 6}L${x - 4} ${y + 6}L${x - 6} ${y - 2}Z`} fill={p.c[1]} opacity={0.85} stroke={shade(p.c[1], -0.45)} strokeWidth={0.8} strokeLinejoin="round" />
          <path d={`M${x} ${y - 8}L${x} ${y + 6}M${x - 6} ${y - 2}L${x + 6} ${y - 2}`} stroke="#fff" strokeWidth={0.6} opacity={0.6} />
        </g>
      ))}
    </g>
  ),
  "bottle/mouthwash": (p) => {
    const body = "M20 24C20 20 24 18 28 18H36C40 18 44 20 44 24V30C40 34 40 40 44 44V55C44 57.5 42 59 39.5 59H24.5C22 59 20 57.5 20 55V44C24 40 24 34 20 30Z";
    const level = Math.min(1, (typeof p.o.fill === "number" ? p.o.fill : 70) / 100);
    return (
      <g>
        <Clip id={p.uid("mw")} d={body}>
          <rect x={18} y={59 - 41 * level} width={30} height={41 * level} fill={p.c[1]} />
        </Clip>
        <Glass p={p} d={body} i={0} tint={0.3} />
        <path d={rrect(24, 8, 16, 11, 2.5)} fill={p.fill(2)} {...outline(p, 2)} />
        <path d="M24 12H40" stroke={shade(p.c[2], -0.3)} strokeWidth={0.7} />
      </g>
    );
  },
  "bottle/lacquer": (p) => {
    const body = rrect(20, 34, 24, 24, 6);
    const level = Math.min(1, (typeof p.o.fill === "number" ? p.o.fill : 70) / 100);
    return (
      <g>
        <Clip id={p.uid("nl")} d={body}>
          <rect x={18} y={58 - 24 * level} width={28} height={24 * level} fill={p.c[1]} />
        </Clip>
        <Glass p={p} d={body} i={0} tint={0.3} />
        <path d={rrect(27, 8, 10, 27, 3)} fill={p.fill(2)} {...outline(p, 2)} />
        <Glint x={29} y={11} h={20} o={0.4} w={1.4} />
      </g>
    );
  },
  "ring/lens": (p) => (
    <g>
      <path d="M10 38C10 24 20 16 32 16C44 16 54 24 54 38C46 33 18 33 10 38Z" fill={p.c[0]} opacity={0.4} {...outline(p, 0)} />
      <path d="M10 38C10 24 20 16 32 16C44 16 54 24 54 38C46 33 18 33 10 38Z" fill={p.glass} />
      <ellipse cx={32} cy={28} rx={9} ry={5} fill={p.c[1]} opacity={0.35} />
      <path d="M18 26C22 21 28 19 34 19" fill="none" stroke="#fff" strokeWidth={1.4} opacity={0.7} strokeLinecap="round" />
    </g>
  ),
  "ring/insert": (p) => (
    <g>
      <path d={rrect(14, 27, 36, 10, 5)} fill={p.c[0]} opacity={0.7} {...outline(p, 0)} />
      <rect x={18} y={29.5} width={28} height={1.5} rx={0.75} fill="#fff" opacity={0.6} />
    </g>
  ),
  "inhaler/capsule": (p) => (
    <g>
      <path d={rrect(16, 18, 32, 40, 10)} fill={p.fill(0)} {...outline(p, 0)} />
      <path d={rrect(26, 6, 12, 14, 3)} fill={p.fill(2)} {...outline(p, 2)} />
      <ellipse cx={32} cy={38} rx={10} ry={8} fill="#fff" opacity={0.5} stroke={shade(p.c[0], -0.4)} strokeWidth={0.7} />
      <g transform="rotate(-30 32 38)">
        <path d="M24 38A3.5 3.5 0 0 1 27.5 34.5H32V41.5H27.5A3.5 3.5 0 0 1 24 38Z" fill={p.c[1]} />
        <path d="M32 34.5H36.5A3.5 3.5 0 0 1 36.5 41.5H32Z" fill={shade(p.c[1], 0.4)} />
      </g>
      <circle cx={44} cy={52} r={2.6} fill={p.fill(1)} stroke={p.ink(1)} strokeWidth={0.7} />
    </g>
  ),
  "patch/device": (p) => (
    <g>
      <path d={rrect(6, 16, 52, 32, 8)} fill={p.fill(0)} {...outline(p, 0)} />
      <path d={rrect(20, 22, 24, 20, 6)} fill={p.fill(1)} {...outline(p, 1)} />
      <circle cx={32} cy={32} r={3.6} fill={p.c[2]} stroke={shade(p.c[2], -0.4)} strokeWidth={0.7} />
      <circle cx={32} cy={32} r={6.5} fill="none" stroke={p.c[2]} strokeWidth={0.8} opacity={0.6} />
    </g>
  ),
  "dispenser/stick": (p) => (
    <g>
      <path d={rrect(25, 22, 14, 36, 3)} fill={p.fill(0)} {...outline(p, 0)} />
      <path d="M26 22V14C26 10 29 8 32 8C35 8 38 10 38 14V22Z" fill={p.dome(1)} {...outline(p, 1)} />
      <path d={rrect(24, 22, 16, 4, 1)} fill={shade(p.c[0], -0.15)} {...outline(p, 0, p.sw * 0.8)} />
      <rect x={25} y={34} width={14} height={12} fill={p.c[2]} />
      <Glint x={27} y={26} h={28} o={0.4} w={1.4} />
    </g>
  ),
  "dispenser/soap": (p) => (
    <g>
      <path d={rrect(10, 22, 44, 26, 11)} transform="translate(0 2)" fill={shade(p.c[0], -0.2)} {...outline(p, 0)} />
      <path d={rrect(10, 22, 44, 26, 11)} fill={p.dome(0)} {...outline(p, 0)} />
      <Label text={text(p.o.labelText)} x={32} y={35} w={28} size={8} color={shade(p.c[0], -0.35)} under={shade(p.c[0], 0.5)} />
      <circle cx={50} cy={16} r={3} fill="none" stroke="#a9cde9" strokeWidth={0.9} />
      <circle cx={44} cy={12} r={2} fill="none" stroke="#a9cde9" strokeWidth={0.9} />
    </g>
  ),
  "suppository/tampon": (p) => (
    <g>
      <path d="M40 32C44 32 48 30 56 34" fill="none" stroke={p.c[1]} strokeWidth={1.2} strokeLinecap="round" />
      <path d={rrect(8, 26, 34, 12, 6)} fill={p.fill(0)} {...outline(p, 0)} />
      {[16, 24, 32].map((x) => (
        <path key={x} d={`M${x} 26.5V37.5`} stroke={shade(p.c[0], -0.2)} strokeWidth={0.7} />
      ))}
    </g>
  ),
  "implant/thread": (p) => (
    <g>
      <path d="M8 40C16 20 26 46 34 28C40 14 50 30 56 22" fill="none" stroke={p.ink(0)} strokeWidth={3.4} strokeLinecap="round" />
      <path d="M8 40C16 20 26 46 34 28C40 14 50 30 56 22" fill="none" stroke={p.c[0]} strokeWidth={1.8} strokeLinecap="round" />
    </g>
  ),
  "nebuliser/steam": (p) => (
    <g>
      <g fill="none" stroke="#9aa5ad" strokeWidth={1.4} strokeLinecap="round" opacity={0.7}>
        <path d="M24 24c-3 -4 3 -6 0 -10" />
        <path d="M32 22c-3 -4 3 -6 0 -10" />
        <path d="M40 24c-3 -4 3 -6 0 -10" />
      </g>
      <path d="M8 30H56C56 44 46 54 32 54C18 54 8 44 8 30Z" fill={p.fill(0)} {...outline(p, 0)} />
      <ellipse cx={32} cy={30} rx={24} ry={4} fill={p.c[1]} {...outline(p, 0, p.sw * 0.8)} />
      <Glint x={13} y={34} h={12} o={0.4} />
    </g>
  ),
};


