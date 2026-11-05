import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";

/**
 * Glides to its content's height whenever that changes (something appears, goes, or rewraps), so
 * nothing below it jumps. Clips only while moving, so shadows inside aren't cut off at rest.
 */
export function AutoHeight({ children, className, reduceMotion }: { children: ReactNode; className?: string; reduceMotion?: boolean }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");
  const [moving, setMoving] = useState(false);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <motion.div
      className={className}
      initial={false}
      animate={{ height }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      onAnimationStart={() => setMoving(true)}
      onAnimationComplete={() => setMoving(false)}
      style={{ overflow: moving ? "hidden" : "visible" }}
    >
      {/* flow-root: children's margins count toward the measured height. */}
      <div ref={inner} style={{ display: "flow-root" }}>
        {children}
      </div>
    </motion.div>
  );
}
