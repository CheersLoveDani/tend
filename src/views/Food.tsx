import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { format, isToday, isYesterday } from "date-fns";
import type { Food as FoodItem, SavedFood } from "../lib/api";
import { useStore } from "../lib/store";
import { canUseCamera, dayTotal, goalProgress, isWater, kcalText, mealFor, MEALS, waterGlass, type GoalProgress } from "../lib/food";
import { cheer } from "../lib/cheer";
import type { FoodGoals } from "../lib/settings";
import { sounds } from "../lib/sound";
import { Plus, Trash } from "../components/Icons";
import type { FoodStart } from "../components/FoodSheet";
import "../food.css";

interface Props {
  onAdd: (start?: FoodStart) => void;
  onEdit: (f: FoodItem) => void;
}

const dayKey = (ms: number) => format(ms, "yyyy-MM-dd");
const dayLabel = (ms: number) => (isToday(ms) ? "Today" : isYesterday(ms) ? "Yesterday" : format(ms, "EEEE d MMM"));

export function Food({ onAdd, onEdit }: Props) {
  const store = useStore();
  const { settings } = store;
  const snap = store.snap!;
  const showKcal = settings.foodShowCalories;
  const todayKey = dayKey(Date.now());

  const todays = useMemo(() => snap.foods.filter((f) => dayKey(f.at) === todayKey), [snap.foods, todayKey]);
  const byMeal = useMemo(() => {
    const groups = MEALS.map((m) => ({ ...m, items: todays.filter((f) => f.meal === m.value).sort((a, b) => a.at - b.at) }));
    const other = todays.filter((f) => !MEALS.some((m) => m.value === f.meal));
    if (other.length) groups.push({ value: "snack", label: "Other", emoji: "🍽️", items: other });
    return groups.filter((g) => g.items.length);
  }, [todays]);
  const earlier = useMemo(() => {
    const days: { key: string; label: string; items: FoodItem[] }[] = [];
    for (const f of snap.foods) {
      const key = dayKey(f.at);
      if (key === todayKey) continue;
      const d = days.at(-1);
      if (d?.key === key) d.items.push(f);
      else if (days.length < 6) days.push({ key, label: dayLabel(f.at), items: [f] });
    }
    return days;
  }, [snap.foods, todayKey]);

  const total = dayTotal(todays);
  const eaten = todays.filter((f) => !isWater(f));
  const guide = showKcal ? settings.foodGuide : null;
  const again = snap.foodLib.slice(0, 8);

  async function logAgain(s: SavedFood) {
    sounds.tap();
    const at = Date.now();
    await store.saveFood({
      id: "",
      name: s.name,
      emoji: s.emoji,
      meal: mealFor(at),
      kcal: s.lastKcal,
      amount: s.lastAmount,
      grams: s.lastGrams,
      source: s.info?.barcode ? "barcode" : s.lastKcal != null ? "manual" : "",
      barcode: s.info?.barcode ?? (s.id.startsWith("n:") ? "" : s.id),
      note: "",
      at,
    });
  }

  return (
    <div className="view">
      <header className="view-head">
        <p className="view-kicker">Food</p>
        <h1>{eaten.length === 0 ? "What have you had today?" : eaten.length === 1 ? "One thing noted today" : `${eaten.length} things noted today`}</h1>
        <p className="view-sub">
          {eaten.length === 0
            ? "Nothing yet. If you haven't eaten in a while, a little something might help."
            : showKcal && total.kcal > 0
              ? `About ${kcalText(total.kcal)} so far${total.missing ? `, plus ${total.missing} without a number` : ""}.`
              : "Every meal and snack you note grows your garden."}
        </p>
      </header>

      <TodaysGoals
        progress={goalProgress(todays)}
        goals={settings.foodGoals}
        kcal={total.kcal}
        guide={guide}
        onWater={() => {
          sounds.tap();
          void store.saveFood(waterGlass(Date.now()));
        }}
      />

      <div className="food-actions">
        <button className="btn btn-primary" onClick={() => onAdd()}>
          <Plus size={16} /> Add food
        </button>
        {canUseCamera && (
          <>
            <button className="btn btn-soft" onClick={() => onAdd("barcode")}>
              <span aria-hidden>▥</span> Scan barcode
            </button>
            {showKcal && (
              <button className="btn btn-soft" onClick={() => onAdd("label")}>
                <span aria-hidden>📷</span> Read a label
              </button>
            )}
          </>
        )}
      </div>

      {again.length > 0 && (
        <section className="list-section">
          <h2 className="section-title">Again</h2>
          <div className="food-again">
            {again.map((s) => (
              <motion.button key={s.id} className="food-again-chip" whileTap={{ scale: 0.94 }} onClick={() => void logAgain(s)} aria-label={`Add ${s.name} again`}>
                <span aria-hidden>{s.emoji || "🍽️"}</span>
                <span className="food-again-name">{s.name}</span>
              </motion.button>
            ))}
          </div>
        </section>
      )}

      {byMeal.length > 0 && (
        <section className="list-section">
          {byMeal.map((g) => (
            <div key={g.label} className="diary-day">
              <h3 className="diary-date">
                {g.emoji} {g.label}
              </h3>
              <AnimatePresence initial={false}>
                {g.items.map((f) => (
                  <FoodRow key={f.id} f={f} showKcal={showKcal} onEdit={onEdit} />
                ))}
              </AnimatePresence>
            </div>
          ))}
        </section>
      )}

      {earlier.length > 0 && (
        <section className="list-section">
          <h2 className="section-title">Earlier</h2>
          {earlier.map((d) => {
            const t = dayTotal(d.items);
            return (
              <div key={d.key} className="diary-day">
                <h3 className="diary-date">
                  {d.label}
                  {showKcal && t.kcal > 0 && <span className="food-day-total"> · {kcalText(t.kcal, true)}</span>}
                </h3>
                {[...d.items].reverse().map((f) => (
                  <FoodRow key={f.id} f={f} showKcal={showKcal} onEdit={onEdit} />
                ))}
              </div>
            );
          })}
        </section>
      )}

      {snap.foods.length === 0 && (
        <button className="empty" onClick={() => onAdd()}>
          <span className="empty-title">
            <Plus size={18} /> Note something you ate
          </span>
          <span className="empty-sub">A name is enough. Calories are optional: scan a barcode, read a label, or take a rough guess.</span>
        </button>
      )}
    </div>
  );
}

function FoodRow({ f, showKcal, onEdit }: { f: FoodItem; showKcal: boolean; onEdit: (f: FoodItem) => void }) {
  const store = useStore();
  return (
    <motion.div className="diary-item food-item" layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }}>
      <button className="diary-main food-main" onClick={() => onEdit(f)}>
        <span className="food-row-emoji" aria-hidden>
          {f.emoji || "🍽️"}
        </span>
        <span className="food-row-text">
          <span className="diary-kind">{f.name}</span>
          {f.amount && <span className="food-row-amount">{f.amount}</span>}
        </span>
        {showKcal && <span className="diary-value">{f.kcal != null ? kcalText(f.kcal) : ""}</span>}
        <span className="diary-time">{format(f.at, "HH:mm")}</span>
        {f.note && <span className="diary-note">{f.note}</span>}
      </button>
      <button className="btn btn-quiet btn-icon" aria-label={`Remove ${f.name}`} onClick={() => void store.deleteFood(f)}>
        <Trash size={15} />
      </button>
    </motion.div>
  );
}

/** One soft ring. Past the goal it just stays full: no red, no warning. */
function Ring({ part, children, size = 68 }: { part: number; children: ReactNode; size?: number }) {
  const { reduceMotion } = useStore();
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  return (
    <span className="food-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={mid} cy={mid} r={r} className="food-guide-track" />
        <motion.circle
          cx={mid}
          cy={mid}
          r={r}
          className="food-guide-fill"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, part))) }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 60, damping: 18 }}
          transform={`rotate(-90 ${mid} ${mid})`}
        />
      </svg>
      <span className="food-ring-mid">{children}</span>
    </span>
  );
}

const GOAL_TEXT: Record<keyof GoalProgress, { emoji: string; label: string; done: (n: number) => string }> = {
  meals: { emoji: "🍽️", label: "Times eaten", done: (n) => `${n === 1 ? "You've eaten" : `${n} times eaten`} today. That's looking after yourself.` },
  fruitVeg: { emoji: "🥦", label: "Fruit & veg", done: (n) => `${n} portions of fruit and veg today. Lovely.` },
  water: { emoji: "💧", label: "Water", done: (n) => `${n} glasses of water today. Nicely done.` },
};

/** Today's goals as soft rings. Reaching one gets a quiet cheer; nothing is ever said about missing one. */
function TodaysGoals({ progress, goals, kcal, guide, onWater }: { progress: GoalProgress; goals: FoodGoals; kcal: number; guide: number | null; onWater: () => void }) {
  const { toast } = useStore();
  const keys = (Object.keys(GOAL_TEXT) as (keyof GoalProgress)[]).filter((k) => goals[k] != null);
  const before = useRef<GoalProgress | null>(null);

  useEffect(() => {
    const prev = before.current;
    before.current = progress;
    if (!prev) return;
    for (const k of keys) {
      const g = goals[k]!;
      if (prev[k] < g && progress[k] >= g) {
        cheer();
        toast(GOAL_TEXT[k].done(progress[k]));
        break;
      }
    }
  }, [progress.meals, progress.fruitVeg, progress.water]); // eslint-disable-line react-hooks/exhaustive-deps

  if (keys.length === 0 && guide == null) return null;
  return (
    <section className="food-goals" aria-label="Today's goals">
      {keys.map((k) => {
        const g = goals[k]!;
        const n = progress[k];
        return (
          <div key={k} className={`food-goal ${n >= g ? "is-met" : ""}`}>
            <Ring part={n / g}>
              <span aria-hidden>{GOAL_TEXT[k].emoji}</span>
            </Ring>
            <span className="food-goal-num">
              {n} <span className="hint">of {g}</span>
            </span>
            <span className="food-goal-label">{GOAL_TEXT[k].label}</span>
            {k === "water" && (
              <button className="btn btn-soft btn-small food-goal-add" onClick={onWater} aria-label="Add a glass of water">
                + Glass
              </button>
            )}
          </div>
        );
      })}
      {guide != null && (
        <div className={`food-goal ${kcal >= guide ? "is-met" : ""}`}>
          <Ring part={kcal / guide}>
            <span aria-hidden>🔥</span>
          </Ring>
          <span className="food-goal-num">
            {kcalText(kcal, true)} <span className="hint">of ~{guide.toLocaleString()}</span>
          </span>
          <span className="food-goal-label">Rough guide</span>
        </div>
      )}
    </section>
  );
}
