import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { format, isToday, isYesterday } from "date-fns";
import type { Food as FoodItem, SavedFood } from "../lib/api";
import { useStore } from "../lib/store";
import { canUseCamera, dayTotal, kcalText, mealFor, MEALS } from "../lib/food";
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
        <h1>{todays.length === 0 ? "What have you had today?" : todays.length === 1 ? "One thing noted today" : `${todays.length} things noted today`}</h1>
        <p className="view-sub">
          {todays.length === 0
            ? "Nothing yet. If you haven't eaten in a while, a little something might help."
            : showKcal && total.kcal > 0
              ? `About ${kcalText(total.kcal)} so far${total.missing ? `, plus ${total.missing} without a number` : ""}.`
              : "Every meal and snack you note grows your garden."}
        </p>
      </header>

      {guide != null && todays.length > 0 && <GuideRing kcal={total.kcal} guide={guide} />}

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

/** A soft ring that fills toward the guide. Past it, it just stays full: no red, no warning. */
function GuideRing({ kcal, guide }: { kcal: number; guide: number }) {
  const { reduceMotion } = useStore();
  const r = 34;
  const c = 2 * Math.PI * r;
  const part = Math.min(1, kcal / guide);
  return (
    <div className="food-guide">
      <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden>
        <circle cx="42" cy="42" r={r} className="food-guide-track" />
        <motion.circle
          cx="42"
          cy="42"
          r={r}
          className="food-guide-fill"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - part) }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 60, damping: 18 }}
          transform="rotate(-90 42 42)"
        />
      </svg>
      <p className="food-guide-text">
        <span className="food-guide-num">{kcalText(kcal, true)}</span>
        <span className="hint">of a rough {guide.toLocaleString()} guide. Bodies need different amounts on different days.</span>
      </p>
    </div>
  );
}
