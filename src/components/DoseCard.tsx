import { motion } from "motion/react";
import type { DoseSlot } from "../lib/api";
import { useStore } from "../lib/store";
import { clock } from "../lib/dates";
import { amountText } from "../lib/meds";
import { MedIcon } from "./MedIcon";
import { Check, Seed } from "./Icons";

interface Props {
  d: DoseSlot;
  onOpen?: (medId: string) => void;
}

function at(ms: number | null) {
  if (!ms) return "";
  const t = new Date(ms);
  return clock(`${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`);
}

/** One dose: take it, skip it, or undo a mistap. */
export function DoseCard({ d, onOpen }: Props) {
  const store = useStore();
  const med = store.snap?.meds.find((m) => m.id === d.medId);
  const open = d.status === "due" || d.status === "upcoming";
  const late = d.status === "due" && Date.now() - d.dueAt > 60 * 60 * 1000;

  const meta =
    d.status === "taken"
      ? `Taken at ${at(d.loggedAt)} · ${amountText(d.amount, d.form)}`
      : d.status === "skipped"
        ? `Skipped · was due ${clock(d.time)}`
        : `${d.status === "due" ? (late ? "Was due" : "Due") : "At"} ${clock(d.time)} · ${amountText(d.amount, d.form)}`;

  return (
    <motion.article
      layout="position"
      className={`card dose-card is-${d.status} ${late ? "is-late" : ""}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -30, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
    >
      <div className="dose-row">
        <button className="dose-icon" onClick={() => onOpen?.(d.medId)} aria-label={`Open ${d.name}`} tabIndex={onOpen ? 0 : -1}>
          <MedIcon icon={med?.icon ?? "round"} color={med?.color ?? "white"} size={42} />
          {d.status === "taken" && (
            <motion.span className="dose-tick" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
              <Check size={12} />
            </motion.span>
          )}
        </button>
        <div className="card-main">
          <span className="card-title">{d.name}</span>
          <span className="card-meta">{meta}</span>
          {open && med?.notes && <span className="card-next">{med.notes}</span>}
        </div>
        {open ? (
          <div className="dose-actions">
            <button className="btn btn-quiet dose-skip" onClick={() => void store.skipDose(d)}>
              Skip
            </button>
            <motion.button className="btn btn-primary dose-take" whileTap={{ scale: 0.92 }} onClick={() => void store.takeDose(d)}>
              <Check size={16} /> Take
              {med && (
                <span className="dose-seeds">
                  <Seed size={11} /> {med.reward}
                </span>
              )}
            </motion.button>
          </div>
        ) : (
          <button className="link dose-undo" onClick={() => void store.undoDose(d)}>
            Undo
          </button>
        )}
      </div>
    </motion.article>
  );
}
