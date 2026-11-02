import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { format, isToday, isYesterday } from "date-fns";
import type { Entry, EntryKind } from "../lib/api";
import { useStore } from "../lib/store";
import { amountText, displayName, entryText, scheduleText } from "../lib/meds";
import { DoseCard } from "../components/DoseCard";
import { MedIcon } from "../components/MedIcon";
import { Check, Plus, Trash } from "../components/Icons";

interface Props {
  onAddMed: () => void;
  onOpenMed: (id: string) => void;
  onEntry: (kind: EntryKind, initial?: Entry) => void;
}

const dayLabel = (ms: number) => (isToday(ms) ? "Today" : isYesterday(ms) ? "Yesterday" : format(ms, "EEE d MMM"));

export function Meds({ onAddMed, onOpenMed, onEntry }: Props) {
  const store = useStore();
  const snap = store.snap!;
  const doses = snap.doses;
  const left = doses.filter((d) => d.status === "due" || d.status === "upcoming").length;
  const due = doses.filter((d) => d.status === "due").length;
  const low = snap.meds.filter((m) => m.low && !m.paused);

  const diary = useMemo(() => {
    const groups: { day: string; items: Entry[] }[] = [];
    for (const e of snap.entries.slice(0, 40)) {
      const day = dayLabel(e.at);
      const g = groups.at(-1);
      if (g?.day === day) g.items.push(e);
      else groups.push({ day, items: [e] });
    }
    return groups;
  }, [snap.entries]);

  return (
    <div className="view">
      <header className="view-head">
        <p className="view-kicker">Medicine</p>
        <h1>{snap.meds.length === 0 ? "Your medicine" : due > 0 ? (due === 1 ? "One dose is due" : `${due} doses are due`) : left > 0 ? "On track today" : "All taken today"}</h1>
        <p className="view-sub">
          {snap.meds.length === 0
            ? "Add what you take and Tend will remind you, count what's left, and give you seeds for every dose."
            : left > 0
              ? `${left} still to take today. Each one grows your garden.`
              : doses.length > 0
                ? "Every dose for today is done. Nicely looked after."
                : "Nothing scheduled for today."}
        </p>
      </header>

      {low.length > 0 && (
        <div className="notice">
          {low.map((m) => (
            <button key={m.id} className="notice-row" onClick={() => onOpenMed(m.id)}>
              <MedIcon icon={m.icon} color={m.color} size={30} />
              <span>
                <strong>{m.name}</strong> is running low: {m.left != null ? amountText(m.left, m.form) : "?"} left.
              </span>
            </button>
          ))}
        </div>
      )}

      {doses.length > 0 && (
        <section className="list-section">
          <h2 className="section-title">Today</h2>
          <div className="list">
            <AnimatePresence mode="popLayout">
              {doses.map((d) => (
                <DoseCard key={d.id} d={d} onOpen={onOpenMed} />
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      <section className="list-section">
        <h2 className="section-title">What you take</h2>
        <div className="med-list">
          {snap.meds.map((m) => (
            <motion.button key={m.id} layout className={`med-card ${m.paused ? "is-paused" : ""}`} onClick={() => onOpenMed(m.id)} whileTap={{ scale: 0.98 }}>
              <MedIcon icon={m.icon} color={m.color} size={44} />
              <span className="med-card-text">
                <span className="card-title">{displayName(m)}</span>
                <span className="card-meta">
                  {m.paused ? "Paused" : scheduleText(m.schedule)}
                </span>
              </span>
              {m.left != null && <span className={`stock-pill ${m.low ? "is-low" : ""}`}>{amountText(m.left, m.form)}</span>}
            </motion.button>
          ))}
          <button className="empty med-add" onClick={onAddMed}>
            <span className="empty-title">
              <Plus size={18} /> Add a medication
            </span>
            <span className="empty-sub">Pills, drops, inhalers, injections, vitamins: anything you take.</span>
          </button>
        </div>
      </section>

      <section className="list-section">
        <h2 className="section-title">Health diary</h2>
        <div className="diary-actions">
          <button className="btn btn-soft" onClick={() => onEntry("mood")}>
            How I feel
          </button>
          <button className="btn btn-soft" onClick={() => onEntry("symptom")}>
            A symptom
          </button>
          <button className="btn btn-soft" onClick={() => onEntry("measurement")}>
            A reading
          </button>
        </div>
        {diary.length === 0 ? (
          <p className="hint">Mood, symptoms and readings like blood pressure or weight. Handy to show a doctor.</p>
        ) : (
          diary.map((g) => (
            <div key={g.day} className="diary-day">
              <h3 className="diary-date">{g.day}</h3>
              {g.items.map((e) => (
                <div key={e.id} className="diary-item">
                  <button className="diary-main" onClick={() => onEntry(e.kind, e)}>
                    <span className={`diary-kind kind-${e.kind}`}>{e.kind === "mood" ? "Mood" : e.name}</span>
                    <span className="diary-value">{entryText(e.kind, e.value, e.value2, e.unit)}</span>
                    <span className="diary-time">{format(e.at, "HH:mm")}</span>
                    {e.note && <span className="diary-note">{e.note}</span>}
                  </button>
                  <button className="btn btn-quiet btn-icon" aria-label={`Remove ${e.name}`} onClick={() => void store.deleteEntry(e)}>
                    <Trash size={15} />
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </section>

      {snap.meds.length > 0 && doses.length > 0 && left === 0 && (
        <p className="hint all-done">
          <Check size={14} /> That's everything for today.
        </p>
      )}
    </div>
  );
}
