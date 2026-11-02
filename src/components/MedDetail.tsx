import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { api, type DayAdherence, type MedView } from "../lib/api";
import { useStore } from "../lib/store";
import { amountText, displayName, formOf, num, scheduleText } from "../lib/meds";
import { MedIcon } from "./MedIcon";
import { Stepper } from "./MedEditor";
import { Check, Close, Plus, Trash } from "./Icons";

interface Props {
  med: MedView;
  onEdit: () => void;
  onClose: () => void;
}

export function MedDetail({ med, onEdit, onClose }: Props) {
  const store = useStore();
  const [days, setDays] = useState<DayAdherence[]>([]);
  const [pack, setPack] = useState(28);
  const [extra, setExtra] = useState(med.schedule.times[0]?.amount ?? 1);
  const unit = formOf(med.form);

  // Re-read the history whenever today's doses change.
  const todayKey = store.snap?.doses.filter((d) => d.medId === med.id).map((d) => d.status).join();
  useEffect(() => {
    void api.medHistory(med.id, 30).then(setDays).catch(() => setDays([]));
  }, [med.id, todayKey]);

  const scheduled = days.reduce((n, d) => n + d.scheduled, 0);
  const taken = days.reduce((n, d) => n + Math.min(d.taken, d.scheduled), 0);
  const rate = scheduled ? Math.round((taken / scheduled) * 100) : null;

  const togglePause = () =>
    void store.saveMed({ ...med, id: med.id, stock: med.left, paused: !med.paused }).then(() => store.toast(med.paused ? `${med.name} is back on` : `${med.name} is paused`));

  return (
    <motion.div className="sheet-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="sheet"
        role="dialog"
        aria-label={med.name}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 330, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="sheet-head">
          <div className="med-title">
            <MedIcon icon={med.icon} color={med.color} size={48} />
            <div>
              <h2>{displayName(med)}</h2>
              <p className="row-hint">
                {med.paused ? "Paused · " : ""}
                {scheduleText(med.schedule)}
              </p>
            </div>
          </div>
          <button className="btn btn-quiet btn-icon" onClick={onClose} aria-label="Close">
            <Close size={18} />
          </button>
        </div>

        <div className="sheet-body">
          {med.notes && <p className="card-notes">{med.notes}</p>}

          {med.schedule.kind !== "asNeeded" && (
            <section className="group">
              <h3>Last 30 days{rate != null && ` · ${rate}% taken`}</h3>
              <div className="adherence" role="img" aria-label={`${taken} of ${scheduled} doses taken in the last 30 days`}>
                {days.map((d) => {
                  const state = d.scheduled === 0 ? "none" : d.taken >= d.scheduled ? "all" : d.taken > 0 ? "some" : d.skipped >= d.scheduled ? "skipped" : "missed";
                  return (
                    <span key={d.date} className={`adh adh-${state}`} title={`${format(parseISO(d.date), "EEE d MMM")}: ${d.taken} of ${d.scheduled}`}>
                      {state === "all" && <Check size={10} />}
                    </span>
                  );
                })}
              </div>
              <div className="bars-axis">
                <span>{days[0] && format(parseISO(days[0].date), "d MMM")}</span>
                <span>Today</span>
              </div>
            </section>
          )}

          <section className="group">
            <h3>Supply</h3>
            {med.left != null ? (
              <>
                <p className={`supply-line ${med.low ? "is-low" : ""}`}>
                  <strong>{amountText(med.left, med.form)}</strong> left
                  {med.daysLeft != null && med.schedule.kind !== "asNeeded" && <> · about {med.daysLeft} {med.daysLeft === 1 ? "day" : "days"}</>}
                  {med.low && " · time to get more"}
                </p>
                <div className="inline-row">
                  Got a new pack of <Stepper label="pack size" value={pack} min={1} max={999} onChange={setPack} /> {unit.many}
                  <button className="btn btn-soft" onClick={() => void store.addStock(med, pack).then(() => store.toast(`Added ${num(pack)} ${unit.many}`))}>
                    <Plus size={16} /> Add
                  </button>
                </div>
              </>
            ) : (
              <p className="hint">Not counting what's left. Turn it on in Edit to get a refill warning.</p>
            )}
          </section>

          <section className="group">
            <h3>{med.schedule.kind === "asNeeded" ? "Take a dose" : "Took an extra dose?"}</h3>
            <div className="inline-row">
              <Stepper label="amount" value={extra} min={0.25} step={0.5} onChange={setExtra} /> {extra === 1 ? unit.one : unit.many}
              <button className="btn btn-primary" onClick={() => void store.takeExtra(med, extra)}>
                <Check size={16} /> Log it now
              </button>
            </div>
          </section>

          <div className="card-actions">
            <button className="btn btn-soft" onClick={onEdit}>
              Edit
            </button>
            <button className="btn btn-quiet" onClick={togglePause}>
              {med.paused ? "Resume reminders" : "Pause reminders"}
            </button>
            <button
              className="btn btn-quiet"
              onClick={() => {
                onClose();
                void store.deleteMed(med);
              }}
            >
              <Trash size={16} /> Remove
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
