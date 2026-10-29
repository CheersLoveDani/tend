import { motion } from "motion/react";
import { useMemo } from "react";

/** Deterministic pseudo-random so the tree looks the same on every device. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Blob {
  x: number;
  y: number;
  r: number;
  shade: number;
}

const CANOPY: Blob[] = (() => {
  const rand = rng(7);
  const out: Blob[] = [];
  for (let i = 0; i < 40; i++) {
    // Fill from the middle outward so early growth looks balanced.
    const ring = Math.sqrt(i / 40);
    const a = rand() * Math.PI * 2;
    out.push({
      x: 100 + Math.cos(a) * ring * 52,
      y: 78 + Math.sin(a) * ring * 34 - ring * 6,
      r: 15 - ring * 4 + rand() * 4,
      shade: Math.floor(rand() * 3),
    });
  }
  return out;
})();

interface Props {
  level: number;
  /** 0..1 progress inside the current level — the tree fills in as it grows. */
  progress: number;
  size?: number;
  still?: boolean;
}

export function Tree({ level, progress, size = 160, still }: Props) {
  const growth = Math.min(1, Math.sqrt((level - 1 + progress) / 24)); // fully grown around level 25
  const trunkH = 14 + growth * 70;
  const leaves = level <= 3 ? 0 : Math.min(CANOPY.length, Math.round(4 + (level - 4 + progress) * 2.4));
  const blossoms = level >= 19;
  const fruit = level >= 22;
  const canopyScale = 0.35 + growth * 0.65;
  const sproutLeaves = level <= 3 ? 1 + Math.floor(progress * 2) + (level - 1) * 2 : 0;

  const branches = useMemo(() => {
    const rand = rng(11);
    const count = Math.min(6, Math.floor(growth * 8));
    return Array.from({ length: count }, (_, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const at = 0.45 + rand() * 0.35;
      return { side, at, len: 16 + rand() * 18 * growth };
    });
  }, [growth]);

  const groundY = 168;
  // Frame small plants closer so a sprout isn't lost in empty sky.
  const viewH = level <= 3 ? 70 : Math.min(180, 70 + trunkH + 60 * canopyScale);
  const viewW = viewH / 0.9;
  const viewBox = `${100 - viewW / 2} ${180 - viewH} ${viewW} ${viewH}`;
  const topY = groundY - trunkH;
  const sway = still
    ? undefined
    : { rotate: [-0.8, 0.8, -0.8], transition: { duration: 7, repeat: Infinity, ease: "easeInOut" as const } };

  return (
    <svg viewBox={viewBox} width={size} height={size * 0.9} className="tree" role="img" aria-label={`Your tree at level ${level}`}>
      <ellipse cx="100" cy={groundY + 2} rx={level <= 3 ? 24 : 44 + growth * 30} ry="7" className="tree-ground" />
      <motion.g style={{ originX: "100px", originY: `${groundY}px` }} animate={sway}>
        {level > 3 && (
          <>
            <motion.path
              d={`M96 ${groundY} C97 ${groundY - trunkH * 0.5} 95 ${topY + 10} 100 ${topY} C105 ${topY + 10} 103 ${groundY - trunkH * 0.5} 104 ${groundY} Z`}
              className="tree-trunk"
              initial={false}
              animate={{ d: `M${97 - growth * 4} ${groundY} C${98 - growth * 2} ${groundY - trunkH * 0.5} ${97} ${topY + 10} 100 ${topY} C103 ${topY + 10} ${102 + growth * 2} ${groundY - trunkH * 0.5} ${103 + growth * 4} ${groundY} Z` }}
              transition={{ type: "spring", stiffness: 60, damping: 14 }}
            />
            {branches.map((b, i) => {
              const y = groundY - trunkH * b.at;
              return (
                <path
                  key={i}
                  d={`M100 ${y} q ${b.side * b.len * 0.5} -6 ${b.side * b.len} -${10 + b.len * 0.3}`}
                  className="tree-branch"
                />
              );
            })}
            <g transform={`translate(100 ${topY + 6}) scale(${canopyScale}) translate(-100 -78)`}>
              {CANOPY.slice(0, leaves).map((b, i) => (
                <motion.circle
                  key={i}
                  cx={b.x}
                  cy={b.y}
                  r={b.r}
                  className={`tree-leaf shade-${b.shade}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 12, delay: still ? 0 : i * 0.015 }}
                  style={{ originX: `${b.x}px`, originY: `${b.y}px` }}
                />
              ))}
              {blossoms &&
                CANOPY.slice(0, leaves)
                  .filter((_, i) => i % 3 === 1)
                  .map((b, i) => <circle key={`b${i}`} cx={b.x + 4} cy={b.y - 3} r="2.6" className="tree-blossom" />)}
              {fruit &&
                CANOPY.slice(0, leaves)
                  .filter((_, i) => i % 5 === 2)
                  .map((b, i) => <circle key={`f${i}`} cx={b.x - 3} cy={b.y + 5} r="3.6" className="tree-fruit" />)}
            </g>
          </>
        )}
        {level <= 3 && (
          <g>
            <ellipse cx="100" cy={groundY - 2} rx="9" ry="6" className="tree-seed" />
            {sproutLeaves > 0 && <path d={`M100 ${groundY - 4} v-${8 + sproutLeaves * 4}`} className="tree-stem" />}
            {Array.from({ length: Math.min(6, sproutLeaves) }, (_, i) => {
              const side = i % 2 === 0 ? -1 : 1;
              const y = groundY - 10 - i * 4;
              return (
                <motion.path
                  key={i}
                  d={`M100 ${y} q ${side * 6} -10 ${side * 14} -6 q ${-side * 6} 8 ${-side * 14} 6`}
                  className="tree-leaf shade-1"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  style={{ originX: "100px", originY: `${y}px` }}
                  transition={{ type: "spring", stiffness: 220, damping: 12 }}
                />
              );
            })}
          </g>
        )}
      </motion.g>
    </svg>
  );
}
