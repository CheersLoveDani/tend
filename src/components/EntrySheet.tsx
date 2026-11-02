import { motion } from "motion/react";
import { useState } from "react";
import { format } from "date-fns";
import type { Entry, EntryKind } from "../lib/api";
import { useStore } from "../lib/store";
import { MEASUREMENTS, MOODS, SEVERITY, SYMPTOMS } from "../lib/meds";
import { sounds } from "../lib/sound";
import { Close, Seed } from "./Icons";

interface Props {
  kind: EntryKind;
  initial?: Entry | null;
  onClose: () => void;
}

const TITLES: Record<EntryKind, string> = { measurement: "Log a reading", symptom: "Log a symptom", mood: "How are you feeling?" };
const FACES = ["", "😣", "😕", "😐", "🙂", "😄"];

const localInput = (ms: number) => format(new Date(ms), "yyyy-MM-dd'T'HH:mm");

export function EntrySheet({ kind, initial, onClose }: Props) {
  const store = useStore();
  const preset = MEASUREMENTS.find((m) => m.name === initial?.name);
  const [name, setName] = useState(initial?.name ?? (kind === "measurement" ? MEASUREMENTS[0].name : kind === "mood" ? "Mood" : ""));
  const [unit, setUnit] = useState(initial?.unit ?? (kind === "measurement" ? MEASUREMENTS[0].unit : ""));
  const [value, setValue] = useState(initial ? String(initial.value) : kind === "symptom" ? "2" : kind === "mood" ? "3" : "");
  const [value2, setValue2] = useState(initial?.value2 != null ? String(initial.value2) : "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [when, setWhen] = useState(localInput(initial?.at ?? Date.now()));
  const [saving, setSaving] = useState(false);
  const measure = MEASUREMENTS.find((m) => m.name === name) ?? preset;
  const two = kind === "measurement" && !!measure?.two;

  const ready = name.trim() && value !== "" && !isNaN(Number(value)) && (!two || (value2 !== "" && !isNaN(Number(value2))));

  async function save() {
    if (!ready) return;
    setSaving(true);
    const ok = await store.saveEntry({
      id: initial?.id ?? "",
      kind,
      name: name.trim(),
      value: Number(value),
      value2: two ? Number(value2) : null,
      unit: kind === "measurement" ? unit : "",
      note,
      at: new Date(when).getTime() || Date.now(),
    });
    setSaving(false);
    if (ok) {
      sounds.step(1);
      onClose();
    }
  }

  return (
    <motion.div className="sheet-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="sheet"
        role="dialog"
        aria-label={TITLES[kind]}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 330, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="sheet-head">
          <h2>{TITLES[kind]}</h2>
          <button className="btn btn-quiet btn-icon" onClick={onClose} aria-label="Close">
            <Close size={18} />
          </button>
        </div>

        <div className="sheet-body">
          {kind === "measurement" && (
            <section className="group">
              <div className="chips">
                {MEASUREMENTS.map((m) => (
                  <button
                    key={m.name}
                    className={`chip ${name === m.name ? "is-on" : ""}`}
                    onClick={() => {
                      setName(m.name);
                      setUnit(m.unit);
                    }}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
              {!MEASUREMENTS.some((m) => m.name === name) && (
                <div className="date-pair">
                  <input className="field-input" placeholder="What you measured" value={name} onChange={(e) => setName(e.target.value)} />
                  <input className="field-input" placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
                </div>
              )}
              <button className="link" onClick={() => (setName(""), setUnit(""))}>
                Something else
              </button>
              <div className="reading">
                <input className="field-input reading-input" inputMode="decimal" placeholder={measure?.two?.[0] ?? "Reading"} value={value} onChange={(e) => setValue(e.target.value)} aria-label={measure?.two?.[0] ?? "Reading"} autoFocus />
                {two && (
                  <>
                    <span className="reading-slash">/</span>
                    <input className="field-input reading-input" inputMode="decimal" placeholder={measure!.two![1]} value={value2} onChange={(e) => setValue2(e.target.value)} aria-label={measure!.two![1]} />
                  </>
                )}
                <span className="time-unit">{unit}</span>
              </div>
            </section>
          )}

          {kind === "symptom" && (
            <section className="group">
              <input className="field-input" placeholder="What are you feeling?" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!initial} />
              <div className="chips">
                {SYMPTOMS.map((s) => (
                  <button key={s} className={`chip ${name === s ? "is-on" : ""}`} onClick={() => setName(s)}>
                    {s}
                  </button>
                ))}
              </div>
              <h3>How strong?</h3>
              <div className="segmented" role="radiogroup" aria-label="How strong">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} role="radio" aria-checked={value === String(n)} className={value === String(n) ? "is-on" : ""} onClick={() => setValue(String(n))}>
                    {value === String(n) && <motion.span layoutId="severity-pill" className="pill-bg" />}
                    <span>{SEVERITY[n]}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {kind === "mood" && (
            <div className="moods" role="radiogroup" aria-label="Mood">
              {MOODS.map((m) => (
                <motion.button key={m.value} role="radio" aria-checked={value === String(m.value)} className={`mood ${value === String(m.value) ? "is-on" : ""}`} whileTap={{ scale: 0.9 }} onClick={() => setValue(String(m.value))}>
                  <span className="mood-face">{FACES[m.value]}</span>
                  <span>{m.label}</span>
                </motion.button>
              ))}
            </div>
          )}

          <textarea className="notes" rows={2} placeholder="Anything worth remembering" value={note} onChange={(e) => setNote(e.target.value)} />
          <label className="date-pair one">
            <span>When</span>
            <input type="datetime-local" className="field-input" value={when} onChange={(e) => e.target.value && setWhen(e.target.value)} />
          </label>
        </div>

        <div className="sheet-foot">
          <button className="btn btn-primary btn-wide" disabled={!ready || saving} onClick={() => void save()}>
            {initial ? "Save changes" : (
              <>
                Save · <Seed size={14} /> 2
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
