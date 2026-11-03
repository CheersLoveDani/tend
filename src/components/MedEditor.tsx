import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { DoseTime, Med, Schedule, ScheduleKind } from "../lib/api";
import { useStore } from "../lib/store";
import { today } from "../lib/dates";
import { COLORS, FORMS, ICONS, formOf, num } from "../lib/meds";
import { sounds } from "../lib/sound";
import { MedIcon } from "./MedIcon";
import { Chevron, Close, Minus, Plus, Seed } from "./Icons";

interface Props {
  initial: (Med & { left?: number | null }) | null;
  onClose: () => void;
}

const KINDS: { value: ScheduleKind; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "interval", label: "Every few days" },
  { value: "weekdays", label: "Some days" },
  { value: "cycle", label: "Cycle" },
  { value: "asNeeded", label: "When needed" },
];

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PRESETS = ["08:00", "12:30", "18:00", "22:00"];

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
}) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, Math.round(v * 100) / 100)));
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" className="round small" onClick={() => set(value - step)} aria-label={`Less ${label}`} disabled={value <= min}>
        <Minus size={14} />
      </button>
      <input
        inputMode="decimal"
        value={num(value)}
        onChange={(e) => e.target.value !== "" && !isNaN(Number(e.target.value)) && set(Number(e.target.value))}
        aria-label={label}
      />
      <button type="button" className="round small" onClick={() => set(value + step)} aria-label={`More ${label}`} disabled={value >= max}>
        <Plus size={14} />
      </button>
    </span>
  );
}

const blankSchedule: Schedule = { kind: "daily", every: 2, days: [0, 1, 2, 3, 4], onDays: 21, offDays: 7, times: [{ time: "08:00", amount: 1 }] };

export function MedEditor({ initial, onClose }: Props) {
  const store = useStore();
  const [name, setName] = useState(initial?.name ?? "");
  const [strength, setStrength] = useState(initial?.strength ?? "");
  const [form, setForm] = useState(initial?.form ?? "pill");
  const [icon, setIcon] = useState(initial?.icon ?? "round");
  const [color, setColor] = useState(initial?.color ?? "white");
  const [schedule, setSchedule] = useState<Schedule>(initial?.schedule ?? blankSchedule);
  const [startDate, setStartDate] = useState(initial?.startDate ?? today());
  const [endDate, setEndDate] = useState<string | null>(initial?.endDate ?? null);
  const [track, setTrack] = useState(initial ? initial.stock != null : false);
  const [stock, setStock] = useState(initial?.left ?? initial?.stock ?? 30);
  const [refillAt, setRefillAt] = useState(initial?.refillAt ?? 7);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [critical, setCritical] = useState(initial?.critical ?? false);
  const [reward, setReward] = useState(initial?.reward ?? 5);
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState(false);
  const iconTouched = useRef(!!initial);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!initial) nameRef.current?.focus();
  }, [initial]);

  const sched = (patch: Partial<Schedule>) => setSchedule((s) => ({ ...s, ...patch }));
  const setTime = (i: number, patch: Partial<DoseTime>) => sched({ times: schedule.times.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const unit = formOf(form);
  const summary = [
    `${color[0].toUpperCase() + color.slice(1)} ${icon === "round" ? "pill" : icon === "split" ? "split pill" : icon}`,
    track ? "counting supply" : "not counting supply",
    notes.trim() && "advice",
    critical && "important",
    `${reward} seeds a dose`,
  ]
    .filter(Boolean)
    .join(" · ");

  function addTime() {
    const used = new Set(schedule.times.map((t) => t.time));
    const time = PRESETS.find((p) => !used.has(p)) ?? "20:00";
    sched({ times: [...schedule.times, { time, amount: schedule.times.at(-1)?.amount ?? 1 }].sort((a, b) => a.time.localeCompare(b.time)) });
    sounds.tap();
  }

  async function save() {
    if (!name.trim()) {
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    const saved = await store.saveMed({
      id: initial?.id ?? null,
      name: name.trim(),
      strength,
      form,
      icon,
      color,
      notes,
      schedule,
      startDate,
      endDate,
      stock: track ? stock : null,
      refillAt: track ? refillAt : null,
      paused: initial?.paused ?? false,
      critical,
      reward,
    });
    setSaving(false);
    if (saved) {
      sounds.step(2);
      onClose();
    }
  }

  return (
    <motion.div className="sheet-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="sheet"
        role="dialog"
        aria-label={initial ? "Edit medication" : "New medication"}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 330, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="sheet-head">
          <h2>{initial ? "Edit medication" : "New medication"}</h2>
          <button className="btn btn-quiet btn-icon" onClick={onClose} aria-label="Close">
            <Close size={18} />
          </button>
        </div>

        <div className="sheet-body">
          <div className="med-head">
            <MedIcon icon={icon} color={color} size={56} />
            <div className="med-head-fields">
              <input
                ref={nameRef}
                className="title-input"
                placeholder="Name, e.g. Sertraline"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Medication name"
              />
              <div className="med-head-pair">
                <input
                  className="field-input"
                  placeholder="Strength, e.g. 50 mg"
                  value={strength}
                  onChange={(e) => setStrength(e.target.value)}
                  aria-label="Strength"
                />
                <select
                  className="field-input med-unit"
                  value={form}
                  onChange={(e) => {
                    setForm(e.target.value);
                    if (!iconTouched.current) setIcon(formOf(e.target.value).icon);
                  }}
                  aria-label="Each dose is measured in"
                >
                  {FORMS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.many}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <section className="group">
            <h3>When</h3>
            <div className="segmented" role="radiogroup" aria-label="How often">
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  role="radio"
                  aria-checked={schedule.kind === k.value}
                  className={schedule.kind === k.value ? "is-on" : ""}
                  onClick={() => sched({ kind: k.value })}
                >
                  {schedule.kind === k.value && <motion.span layoutId="med-kind-pill" className="pill-bg" />}
                  <span>{k.label}</span>
                </button>
              ))}
            </div>
            {schedule.kind === "interval" && (
              <div className="inline-row">
                Every <Stepper label="days between doses" value={schedule.every} min={2} max={90} onChange={(v) => sched({ every: v })} /> days, counting from
                the start date
              </div>
            )}
            {schedule.kind === "weekdays" && (
              <div className="chips">
                {WEEK.map((d, i) => (
                  <button
                    key={d}
                    className={`chip ${schedule.days.includes(i) ? "is-on" : ""}`}
                    aria-pressed={schedule.days.includes(i)}
                    onClick={() => sched({ days: schedule.days.includes(i) ? schedule.days.filter((x) => x !== i) : [...schedule.days, i].sort() })}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
            {schedule.kind === "cycle" && (
              <div className="inline-row">
                <Stepper label="days on" value={schedule.onDays} min={1} max={365} onChange={(v) => sched({ onDays: v })} /> days on, then
                <Stepper label="days off" value={schedule.offDays} min={0} max={365} onChange={(v) => sched({ offDays: v })} /> off
              </div>
            )}
            {schedule.kind !== "asNeeded" && (
              <div className="time-list">
                <AnimatePresence initial={false}>
                  {schedule.times.map((t, i) => (
                    <motion.div
                      key={i}
                      className="time-row"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <input
                        type="time"
                        className="field-input"
                        value={t.time}
                        onChange={(e) => e.target.value && setTime(i, { time: e.target.value })}
                        aria-label={`Dose ${i + 1} time`}
                      />
                      <Stepper
                        label={`dose ${i + 1} amount`}
                        value={t.amount}
                        min={0.25}
                        step={["ml", "mg", "g", "IU", "unit"].includes(form) ? 1 : 0.5}
                        onChange={(v) => setTime(i, { amount: v })}
                      />
                      <span className="time-unit">{t.amount === 1 ? unit.one : unit.many}</span>
                      <button
                        className="btn btn-quiet btn-icon"
                        aria-label={`Remove dose ${i + 1}`}
                        disabled={schedule.times.length === 1}
                        onClick={() => sched({ times: schedule.times.filter((_, j) => j !== i) })}
                      >
                        <Close size={14} />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <button className="btn btn-soft" onClick={addTime}>
                  <Plus size={16} /> Another time
                </button>
              </div>
            )}
          </section>

          {/* Only name and when are needed to save; the rest waits behind one tap. */}
          <button className="more-details" aria-expanded={more} onClick={() => setMore(!more)}>
            <span className="more-details-label">{more ? "Fewer details" : "More details"}</span>
            {!more && <span className="row-hint">{summary}</span>}
            <Chevron size={16} className={more ? "is-open" : ""} />
          </button>
          <AnimatePresence initial={false}>
            {more && (
              <motion.div
                className="more-details-body"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <section className="group">
                  <h3>What it looks like</h3>
                  <div className="icon-grid" role="radiogroup" aria-label="Shape">
                    {ICONS.map((i) => (
                      <button
                        key={i}
                        role="radio"
                        aria-checked={icon === i}
                        aria-label={i}
                        className={`icon-pick ${icon === i ? "is-on" : ""}`}
                        onClick={() => ((iconTouched.current = true), setIcon(i))}
                      >
                        <MedIcon icon={i} color={color} size={30} bare />
                      </button>
                    ))}
                  </div>
                  <div className="swatches" role="radiogroup" aria-label="Colour">
                    {Object.entries(COLORS).map(([key, [a, b]]) => (
                      <button
                        key={key}
                        role="radio"
                        aria-checked={color === key}
                        aria-label={key}
                        className={`swatch ${color === key ? "is-on" : ""}`}
                        style={{ background: `linear-gradient(135deg, ${a} 50%, ${b} 50%)` }}
                        onClick={() => setColor(key)}
                      />
                    ))}
                  </div>
                </section>

                <section className="group">
                  <h3>Dates</h3>
                  <div className="date-pair">
                    <label>
                      <span>Starts</span>
                      <input type="date" className="field-input" value={startDate} onChange={(e) => e.target.value && setStartDate(e.target.value)} />
                    </label>
                    <label>
                      <span>Ends</span>
                      <input type="date" className="field-input" value={endDate ?? ""} min={startDate} onChange={(e) => setEndDate(e.target.value || null)} />
                    </label>
                  </div>
                  {!endDate && <p className="hint">No end date: it keeps going until you change it.</p>}
                </section>

                <section className="group">
                  <h3>Supply</h3>
                  <label className="check-row">
                    <input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} />
                    <span>Count what's left and warn me before it runs out</span>
                  </label>
                  {track && (
                    <div className="supply">
                      <div className="inline-row">
                        <Stepper label="on hand" value={stock} min={0} max={9999} onChange={setStock} /> {unit.many} on hand
                      </div>
                      <div className="inline-row">
                        Remind me at <Stepper label="refill reminder" value={refillAt} min={0} max={999} onChange={setRefillAt} /> left
                      </div>
                    </div>
                  )}
                </section>

                <section className="group">
                  <h3>Intake advice</h3>
                  <input className="field-input" placeholder="e.g. with food, not with grapefruit" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </section>

                <section className="group">
                  <label className="check-row">
                    <input type="checkbox" checked={critical} onChange={(e) => setCritical(e.target.checked)} />
                    <span>
                      Important: remind me even in quiet hours
                      <span className="row-hint">For doses that can't wait until morning.</span>
                    </span>
                  </label>
                  <div className="inline-row">
                    <Seed size={16} /> Seeds per dose <Stepper label="seeds per dose" value={reward} min={1} max={20} onChange={setReward} />
                  </div>
                  <p className="hint">Taking it within an hour of its time adds 2 more. Skipping one still earns a little, and nothing is ever taken away.</p>
                </section>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="sheet-foot">
          <button className="btn btn-primary btn-wide" onClick={() => void save()} disabled={saving || !name.trim()}>
            {initial ? "Save changes" : "Add medication"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
