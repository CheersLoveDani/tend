import { AnimatePresence, motion, Reorder } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as chrono from "chrono-node";
import { format, parseISO } from "date-fns";
import { api, isAndroid, uid, type Reminder, type Repeat, type Step, type StepIdea, type Suggestion } from "../lib/api";
import { useStore } from "../lib/store";
import { clock, dayName, plusDays, today, ymd } from "../lib/dates";
import { stepValue } from "../lib/rewards";
import { sounds } from "../lib/sound";
import { Calendar, Close, Minus, Plus, Seed, Sparkle, Steps } from "./Icons";

interface Props {
  initial: Reminder | null;
  defaultDate?: string;
  onClose: () => void;
}

const REPEATS: { value: Repeat | null; label: string }[] = [
  { value: null, label: "Once" },
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const TIMES = [
  { label: "Morning", value: "09:00" },
  { label: "Lunch", value: "12:30" },
  { label: "Afternoon", value: "15:00" },
  { label: "Evening", value: "19:00" },
];

const shortDay = (d: string) => {
  const n = dayName(d);
  return n === "Today" ? "Today" : n === "Tomorrow" ? "Tmrw" : format(parseISO(d), "EEE");
};

const forDay = (d: string) => {
  const n = dayName(d);
  return n === "Today" || n === "Tomorrow" ? n.toLowerCase() : n;
};

/** Suggestions already computed this session, so retyping never re-runs the model. */
const suggestCache = new Map<string, Suggestion>();
const ideaCache = new Map<string, StepIdea[]>();

/** Pulls "tomorrow at 5pm" out of a typed title. */
function parseWhen(text: string) {
  const res = chrono.en.GB.parse(text, new Date(), { forwardDate: true })[0];
  if (!res) return null;
  const d = res.start.date();
  const hasTime = res.start.isCertain("hour");
  const cleaned = (text.slice(0, res.index) + text.slice(res.index + res.text.length))
    .replace(/\s+(at|on|by)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return {
    date: ymd(d),
    time: hasTime ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : null,
    cleaned,
    matched: res.text,
  };
}

export function Editor({ initial, defaultDate, onClose }: Props) {
  const store = useStore();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [showNotes, setShowNotes] = useState(!!initial?.notes);
  const [date, setDate] = useState(initial?.date ?? defaultDate ?? today());
  const [time, setTime] = useState<string | null>(initial?.time ?? null);
  const [repeat, setRepeat] = useState<Repeat | null>(initial?.repeat ?? null);
  const [steps, setSteps] = useState<Step[]>(initial?.steps ?? []);
  const [stepDraft, setStepDraft] = useState("");
  const [reward, setReward] = useState(initial?.reward ?? 15);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(
    initial?.suggested ? { reward: initial.suggested, effort: initial.suggested / 5, source: "memory", millis: 0, reason: "Suggested when you planted it" } : null,
  );
  const [thinking, setThinking] = useState(false);
  const [touched, setTouched] = useState(!!initial);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const when = useMemo(() => (initial ? null : parseWhen(title)), [title, initial]);
  const [ideas, setIdeas] = useState<StepIdea[]>([]);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Ask the tiny model for a value once typing settles; it loads, scores and unloads.
  useEffect(() => {
    const text = (when?.cleaned ?? title).trim();
    if (text.length < 3 || touched) return;
    const key = `${text}|${steps.map((x) => x.title).join("/")}`;
    const cached = suggestCache.get(key);
    if (cached) {
      setSuggestion(cached);
      setReward(cached.reward);
      return;
    }
    const t = window.setTimeout(async () => {
      setThinking(true);
      try {
        const s = await api.suggest(text, notes, steps.map((x) => x.title), store.settings.useModel);
        suggestCache.set(key, s);
        setSuggestion(s);
        if (!touched) setReward(s.reward);
      } catch {
        /* suggestions are optional */
      } finally {
        setThinking(false);
      }
    }, isAndroid ? 1400 : 800);
    return () => window.clearTimeout(t);
  }, [title, steps, touched, when?.cleaned]);

  // Offer ready-made tiny steps (yours first, then the library) while the list is empty.
  useEffect(() => {
    const text = (when?.cleaned ?? title).trim();
    if (text.length < 3 || steps.length > 0) {
      setIdeas([]);
      return;
    }
    const cached = ideaCache.get(text);
    if (cached) {
      setIdeas(cached);
      return;
    }
    const t = window.setTimeout(async () => {
      // The reward suggestion runs first; retry briefly if the model is still busy with it.
      for (let i = 0; i < 4; i++) {
        try {
          const found = await api.suggestSteps(text);
          ideaCache.set(text, found);
          setIdeas(found);
          return;
        } catch (e) {
          if (!String(e).includes("busy")) return;
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    }, isAndroid ? 1600 : 1000);
    return () => window.clearTimeout(t);
  }, [title, steps.length, when?.cleaned]);

  function useIdea(idea: StepIdea) {
    sounds.step(1);
    setSteps(idea.steps.map((t) => ({ id: uid(), title: t, done: false })));
    setIdeas([]);
  }

  const effectiveDate = when?.date ?? date;
  const effectiveTime = when?.time ?? time;
  const nudge = suggestion ? reward - suggestion.reward : 0;

  function bump(by: number) {
    sounds.tap();
    setTouched(true);
    setReward((r) => Math.max(1, Math.min(100, r + by)));
  }

  function addStep() {
    const t = stepDraft.trim();
    if (!t) return;
    setSteps((s) => [...s, { id: uid(), title: t, done: false }]);
    setStepDraft("");
    sounds.tap();
  }

  async function save() {
    const finalTitle = (when?.cleaned || title).trim();
    if (!finalTitle) {
      titleRef.current?.focus();
      return;
    }
    setSaving(true);
    const saved = await store.save({
      id: initial?.id ?? null,
      title: finalTitle,
      notes,
      date: effectiveDate,
      time: effectiveTime,
      steps,
      reward,
      suggested: suggestion?.reward ?? null,
      repeat,
    });
    setSaving(false);
    if (saved) {
      sounds.step(2);
      onClose();
    }
  }

  const week = Array.from({ length: 7 }, (_, i) => plusDays(i));

  return (
    <motion.div className="sheet-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="sheet"
        role="dialog"
        aria-label={initial ? "Edit reminder" : "New reminder"}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 330, damping: 34 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        dragListener={false}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void save();
        }}
      >
        <div className="sheet-head">
          <h2>{initial ? "Edit reminder" : "New reminder"}</h2>
          <button className="btn btn-quiet btn-icon" onClick={onClose} aria-label="Close">
            <Close size={18} />
          </button>
        </div>

        <div className="sheet-body">
          <label className="field">
            <span className="sr-only">What do you want to remember?</span>
            <input
              ref={titleRef}
              className="title-input"
              placeholder="Call the dentist tomorrow at 10"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.ctrlKey && void save()}
            />
          </label>
          <AnimatePresence>
            {when && (
              <motion.p className="parsed" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <Calendar size={14} /> {dayName(when.date)}
                {when.time && `, ${clock(when.time)}`} — picked up from “{when.matched}”
              </motion.p>
            )}
          </AnimatePresence>

          {!when && (
            <section className="group">
              <h3>When</h3>
              <div className="day-strip" role="radiogroup" aria-label="Day">
                {week.map((d) => (
                  <button key={d} role="radio" aria-checked={date === d} className={`day ${date === d ? "is-on" : ""}`} onClick={() => setDate(d)}>
                    <span className="day-name">{shortDay(d)}</span>
                    <span className="day-num">{Number(d.slice(8))}</span>
                    {date === d && <motion.span layoutId="day-pill" className="pill-bg" />}
                  </button>
                ))}
                <label className={`day day-pick ${!week.includes(date) ? "is-on" : ""}`}>
                  <span className="day-name">{week.includes(date) ? "Later" : dayName(date)}</span>
                  <Calendar size={16} />
                  <input type="date" value={date} min={today()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Pick a date" />
                </label>
              </div>
              <div className="chips">
                <button className={`chip ${time === null ? "is-on" : ""}`} onClick={() => setTime(null)}>
                  Any time
                </button>
                {TIMES.map((t) => (
                  <button key={t.value} className={`chip ${time === t.value ? "is-on" : ""}`} onClick={() => setTime(t.value)}>
                    {t.label}
                  </button>
                ))}
                <input
                  type="time"
                  className={`chip chip-time ${time && !TIMES.some((t) => t.value === time) ? "is-on" : ""}`}
                  value={time ?? ""}
                  onChange={(e) => setTime(e.target.value || null)}
                  aria-label="Exact time"
                />
              </div>
            </section>
          )}

          <section className="group">
            <h3>Repeat</h3>
            <div className="segmented" role="radiogroup" aria-label="Repeat">
              {REPEATS.map((r) => (
                <button key={r.label} role="radio" aria-checked={repeat === r.value} className={repeat === r.value ? "is-on" : ""} onClick={() => setRepeat(r.value)}>
                  {repeat === r.value && <motion.span layoutId="repeat-pill" className="pill-bg" />}
                  <span>{r.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="group">
            <h3>
              <Steps size={15} /> Tiny steps
            </h3>
            <p className="hint">Breaking it down makes starting easier — each step pays seeds as you go.</p>
            <Reorder.Group axis="y" values={steps} onReorder={setSteps} className="step-edit">
              <AnimatePresence initial={false}>
                {steps.map((s, i) => (
                  <Reorder.Item key={s.id} value={s} className="step-edit-item" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                    <span className="step-num">{i + 1}</span>
                    <input
                      value={s.title}
                      onChange={(e) => setSteps((all) => all.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)))}
                      aria-label={`Step ${i + 1}`}
                    />
                    <span className="step-value">
                      <Seed size={11} /> {stepValue({ reward, steps })}
                    </span>
                    <button className="btn btn-quiet btn-icon" aria-label={`Remove step ${i + 1}`} onClick={() => setSteps((all) => all.filter((x) => x.id !== s.id))}>
                      <Close size={14} />
                    </button>
                  </Reorder.Item>
                ))}
              </AnimatePresence>
            </Reorder.Group>
            <AnimatePresence>
              {ideas.length > 0 && steps.length === 0 && (
                <motion.div className="ideas" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                  {ideas.map((idea, i) => (
                    <motion.button
                      key={idea.from + i}
                      className="idea"
                      onClick={() => useIdea(idea)}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                    >
                      <span className="idea-from">
                        <Sparkle size={13} /> {idea.source === "yours" ? `Like your "${idea.from}"` : `A way to break down "${idea.from}"`}
                      </span>
                      <ol>
                        {idea.steps.map((st) => (
                          <li key={st}>{st}</li>
                        ))}
                      </ol>
                      <span className="idea-use">Use these steps</span>
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <div className="step-add">
              <input
                placeholder={steps.length ? "Another step" : "First tiny step, e.g. find the letter"}
                value={stepDraft}
                onChange={(e) => setStepDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addStep();
                  }
                }}
              />
              <button className="btn btn-soft btn-icon" onClick={addStep} aria-label="Add step" disabled={!stepDraft.trim()}>
                <Plus size={16} />
              </button>
            </div>
          </section>

          {showNotes ? (
            <textarea className="notes" placeholder="Anything that helps future you" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          ) : (
            <button className="link" onClick={() => setShowNotes(true)}>
              Add a note
            </button>
          )}

          <section className="group reward-pick">
            <h3>Reward</h3>
            <div className="reward-row">
              <button className="round" onClick={() => bump(-5)} aria-label="Fewer seeds">
                <Minus size={18} />
              </button>
              <div className="reward-value">
                <Seed size={22} />
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span key={reward} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={{ type: "spring", stiffness: 400, damping: 30 }}>
                    {reward}
                  </motion.span>
                </AnimatePresence>
              </div>
              <button className="round" onClick={() => bump(5)} aria-label="More seeds">
                <Plus size={18} />
              </button>
            </div>
            <div className="suggest-line" aria-live="polite">
              {thinking ? (
                <span className="thinking">
                  <Sparkle size={14} /> Thinking about it…
                </span>
              ) : suggestion ? (
                <>
                  <span>
                    <Sparkle size={14} /> Suggested {suggestion.reward}
                    {suggestion.reason && ` — ${suggestion.reason}`}
                  </span>
                  {nudge !== 0 && (
                    <span className="nudge">
                      You nudged it {nudge > 0 ? "up" : "down"} {Math.abs(nudge)}. Tend will remember that next time.
                      <button className="link" onClick={() => setReward(suggestion.reward)}>
                        Use {suggestion.reward}
                      </button>
                    </span>
                  )}
                </>
              ) : (
                <span className="muted">Type a name and Tend will suggest a value.</span>
              )}
            </div>
          </section>
        </div>

        <div className="sheet-foot">
          <button className="btn btn-primary btn-wide" onClick={() => void save()} disabled={saving || !title.trim()}>
            {initial ? "Save changes" : `Plant it for ${forDay(effectiveDate)}`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
