import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { format, nextMonday, parseISO } from "date-fns";
import { SOMEDAY, isSomeday, type Reminder } from "../lib/api";
import { useStore } from "../lib/store";
import { today, tomorrow, ymd } from "../lib/dates";
import { useBackClose } from "../lib/backStack";
import { Calendar, Moon, Sun } from "./Icons";

/** "Move to…": Today / Tomorrow / Next week / Pick a day / Someday, without opening the editor. */
export function MoveMenu({ r, onClose }: { r: Reminder; onClose: () => void }) {
  const store = useStore();
  const first = useRef<HTMLButtonElement>(null);
  const t = today();
  const monday = ymd(nextMonday(new Date()));
  const go = (date: string) => {
    onClose();
    void store.moveTo(r, date);
  };

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useBackClose(onClose);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const options: { key: string; label: string; sub?: string; icon: typeof Sun; date: string }[] = [];
  if (r.date !== t) options.push({ key: "today", label: "Today", icon: Sun, date: t });
  if (r.date !== tomorrow()) options.push({ key: "tomorrow", label: "Tomorrow", icon: Moon, date: tomorrow() });
  if (r.date !== monday) options.push({ key: "week", label: "Next week", sub: format(parseISO(monday), "EEE d MMM"), icon: Calendar, date: monday });

  // Rendered at the body so a card's layout animation can't shift the fixed overlay.
  return createPortal(
    <motion.div className="sheet-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="sheet move-sheet"
        role="dialog"
        aria-label={`Move "${r.title}"`}
        initial={{ y: store.reduceMotion ? 0 : 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: store.reduceMotion ? 0 : 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h2>Move to…</h2>
        </div>
        <p className="move-title">{r.title}</p>
        <div className="move-options">
          {options.map((o, i) => (
            <button key={o.key} ref={i === 0 ? first : undefined} className="move-option" onClick={() => go(o.date)}>
              <o.icon size={18} />
              <span>{o.label}</span>
              {o.sub && <span className="move-sub">{o.sub}</span>}
            </button>
          ))}
          <label className="move-option move-pick">
            <Calendar size={18} />
            <span>Pick a day</span>
            <input type="date" min={t} aria-label="Pick a day" onChange={(e) => e.target.value && go(e.target.value)} />
          </label>
          {!isSomeday(r) && (
            <button className="move-option" onClick={() => go(SOMEDAY)}>
              <span className="move-someday" aria-hidden>
                ∞
              </span>
              <span>Someday</span>
              <span className="move-sub">no day, no reminders</span>
            </button>
          )}
        </div>
        <div className="sheet-foot">
          <button className="btn btn-quiet btn-wide" onClick={onClose}>
            Leave it where it is
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
