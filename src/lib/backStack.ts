// Small overlays (menus, one-off sheets) that Android's back button should close first,
// before the shell's own sheets and tabs.
import { useEffect, useRef } from "react";

const stack: (() => void)[] = [];

/** Closes the newest overlay; false when there was none. */
export function closeTopOverlay(): boolean {
  const top = stack.at(-1);
  if (!top) return false;
  top();
  return true;
}

/** While mounted, back (and the mouse's back button) calls `close`. */
export function useBackClose(close: () => void) {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => {
    const fn = () => ref.current();
    stack.push(fn);
    return () => {
      const i = stack.lastIndexOf(fn);
      if (i >= 0) stack.splice(i, 1);
    };
  }, []);
}
