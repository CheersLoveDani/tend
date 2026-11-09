import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { api, isAndroid, type Food, type FoodInfo, type Meal, type SavedFood } from "../lib/api";
import { friendlyError, useStore } from "../lib/store";
import { canUseCamera, COMMON, estimate, forGrams, infoTitle, kcalText, MEALS, mealFor, readLabel, scanFoodBarcode, splitCount, type Common } from "../lib/food";
import { sounds } from "../lib/sound";
import { Close, Seed } from "./Icons";
import "../food.css";

export type FoodStart = "barcode" | "label" | null;

interface Props {
  initial?: Food | null;
  /** Open straight into the barcode scanner or the label camera. */
  start?: FoodStart;
  onClose: () => void;
}

type Mode = "portion" | "grams" | "pack";
type Source = Food["source"];

const localInput = (ms: number) => format(new Date(ms), "yyyy-MM-dd'T'HH:mm");
const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() !== "" && isFinite(n) && n >= 0 ? n : null;
};
const SOURCE_TEXT: Record<Source, string> = {
  barcode: "From Open Food Facts, by barcode.",
  search: "From Open Food Facts.",
  label: "Read from the label. Check it looks right.",
  estimate: "A rough estimate for a typical portion.",
  manual: "",
  "": "",
};

/** An everyday food as product info, so portions and grams work the same way for both. */
const commonInfo = (c: Common): FoodInfo => ({
  name: c.name,
  brand: "",
  barcode: "",
  kcal100: c.grams ? Math.round((c.kcal / c.grams) * 1000) / 10 : null,
  kcalServing: c.kcal,
  servingG: c.grams,
  servingText: c.portion,
  packG: null,
  unit: "g",
});

const perPortion = (i: FoodInfo) => i.kcalServing ?? (i.kcal100 != null && i.servingG ? (i.kcal100 * i.servingG) / 100 : null);

export function FoodSheet({ initial, start = null, onClose }: Props) {
  const store = useStore();
  const { settings, snap } = store;
  const showKcal = settings.foodShowCalories;
  const lib = snap?.foodLib ?? [];
  const savedFor = (f: Pick<Food, "barcode" | "name">) =>
    lib.find((s) => (f.barcode ? s.id === f.barcode : s.id === `n:${f.name.trim().toLowerCase().replace(/\s+/g, " ")}`));

  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "");
  const [meal, setMeal] = useState<Meal>(initial?.meal ?? mealFor(Date.now()));
  const [when, setWhen] = useState(localInput(initial?.at ?? Date.now()));
  const [note, setNote] = useState(initial?.note ?? "");
  const [barcode, setBarcode] = useState(initial?.barcode ?? "");
  const [source, setSource] = useState<Source>(initial?.source ?? "");
  const [info, setInfo] = useState<FoodInfo | null>(() => (initial ? (savedFor(initial)?.info ?? null) : null));
  const [mode, setMode] = useState<Mode>("portion");
  const [count, setCount] = useState(1);
  const [grams, setGrams] = useState(initial?.grams ? String(initial.grams) : "");
  // Typed calories win over worked-out ones until the amount is changed again.
  const [kcalInput, setKcalInput] = useState(initial?.kcal != null ? String(initial.kcal) : "");
  const [kcalTyped, setKcalTyped] = useState(!!initial);
  const [amountText, setAmountText] = useState(initial?.amount ?? "");
  const [seen, setSeen] = useState<number[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [results, setResults] = useState<FoodInfo[] | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const picked = !!info || kcalTyped;

  const portionKcal = info ? perPortion(info) : null;
  const canPortion = portionKcal != null;
  const canGrams = info?.kcal100 != null;
  const canPack = canGrams && !!info?.packG;
  const unit = info?.unit === "ml" ? "ml" : "g";

  const worked = useMemo((): { kcal: number | null; amount: string; grams: number | null } => {
    if (!info) return { kcal: null, amount: amountText, grams: num(grams) };
    if (mode === "grams" && info.kcal100 != null) {
      const g = num(grams);
      return { kcal: g ? forGrams(info.kcal100, g) : null, amount: g ? `${g} ${unit}` : "", grams: g };
    }
    if (mode === "pack" && info.kcal100 != null && info.packG) {
      return { kcal: forGrams(info.kcal100, info.packG), amount: `whole pack (${info.packG} ${unit})`, grams: info.packG };
    }
    const per = perPortion(info);
    const what = info.servingText || "portion";
    return {
      kcal: per != null ? Math.round(per * count) : null,
      amount: count === 1 ? what : `${count} × ${what}`,
      grams: info.servingG ? Math.round(info.servingG * count) : null,
    };
  }, [info, mode, grams, count, unit, amountText]);

  const kcal = kcalTyped ? num(kcalInput) : worked.kcal;

  /** Use what's known about a product: name, emoji, how to measure it. */
  function applyInfo(i: FoodInfo, from: Source, opts: { emoji?: string; count?: number; keepName?: boolean } = {}) {
    setInfo(i);
    setSource(from);
    if (!opts.keepName || !name.trim()) setName(infoTitle(i));
    if (opts.emoji) setEmoji(opts.emoji);
    if (i.barcode) setBarcode(i.barcode);
    setCount(opts.count ?? 1);
    setKcalTyped(false);
    setResults(null);
    setMode(perPortion(i) != null ? "portion" : i.kcal100 != null ? "grams" : "portion");
    if (perPortion(i) == null && i.kcal100 != null) setGrams(i.servingG ? String(i.servingG) : "100");
  }

  function applySaved(s: SavedFood) {
    sounds.tap();
    setName(s.name);
    setEmoji(s.emoji);
    if (s.info) {
      applyInfo(s.info, s.info.barcode ? "barcode" : "manual", { emoji: s.emoji });
    }
    if (s.lastKcal != null && !s.info) {
      setKcalInput(String(s.lastKcal));
      setKcalTyped(true);
    }
    if (s.lastAmount) setAmountText(s.lastAmount);
    setResults(null);
  }

  function applyCommon(c: Common) {
    sounds.tap();
    const { count: n } = splitCount(name);
    const typed = name.trim();
    const known = `${c.name} ${c.also ?? ""}`.toLowerCase();
    const extra = splitCount(typed)
      .rest.split(" ")
      .filter((w) => w && !known.includes(w.replace(/e?s$/, "")));
    applyInfo(commonInfo(c), "estimate", { emoji: c.emoji, count: n });
    // Keep their own words ("mum's lasagne") when they typed more than the bare match.
    if (extra.length) setName(typed.replace(/^(\d+(\.\d+)?|an?|one|two|three|four|half( an?)?)\s+(x\s+)?/i, ""));
  }

  async function lookUp(digits: string) {
    const saved = lib.find((s) => s.id === digits);
    if (saved) return applySaved(saved);
    setBusy("Looking it up…");
    setMessage(null);
    try {
      const found = await api.foodBarcode(digits);
      setBarcode(digits);
      if (found) {
        applyInfo(found, "barcode");
        sounds.step(1);
      } else {
        setSource("manual");
        setMessage(
          canUseCamera
            ? "Open Food Facts doesn't know this one yet. Type its name, and read the label for calories if you like. Tend will remember it next time."
            : "Open Food Facts doesn't know this one yet. Type its name and calories, and Tend will remember it next time.",
        );
      }
    } catch (e) {
      setMessage(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  async function scan() {
    try {
      const digits = await scanFoodBarcode();
      if (digits) await lookUp(digits);
    } catch (e) {
      setMessage(friendlyError(e));
    }
  }

  async function label() {
    setMessage(null);
    try {
      setBusy("Reading the label…");
      const g = await readLabel();
      if (!g) return;
      setSeen(g.seen);
      if (g.kcal100 == null && g.kcalServing == null) {
        setMessage("Couldn't find calories in that photo. Try again closer, with the label flat and well lit, or type the number in.");
        return;
      }
      const i: FoodInfo = {
        name: info?.name || name.trim(),
        brand: info?.brand ?? "",
        barcode: barcode || info?.barcode || "",
        kcal100: g.kcal100,
        kcalServing: g.kcalServing,
        servingG: g.servingG,
        servingText: g.servingG ? `portion (${g.servingG} ${g.unit})` : "portion",
        packG: info?.packG ?? null,
        unit: g.unit,
      };
      applyInfo(i, "label", { keepName: true });
      sounds.step(1);
    } catch (e) {
      setMessage(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  async function search() {
    const q = splitCount(name).rest || name.trim();
    if (q.length < 2) return;
    setBusy("Searching…");
    setMessage(null);
    try {
      const r = await api.foodSearch(q);
      setResults(r);
      if (!r.length) setMessage("Nothing with calories came up. A rough estimate or your own number works just as well.");
    } catch (e) {
      setMessage(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  // Open straight into the camera when asked.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !start || !canUseCamera) return;
    started.current = true;
    if (start === "barcode") void scan();
    else void label();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const typed = name.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (picked || typed.length < 2) return { mine: [] as SavedFood[], common: [] as Common[] };
    const rest = splitCount(typed).rest;
    const mine = lib.filter((s) => s.name.toLowerCase().includes(rest)).slice(0, 4);
    const common = estimate(typed, 4).filter((c) => !mine.some((m) => m.name.toLowerCase() === c.name.toLowerCase()));
    return { mine, common };
  }, [typed, picked, lib]);

  const ready = name.trim().length > 0 && !saving;

  async function save() {
    if (!ready) return;
    setSaving(true);
    let face = emoji;
    if (!face) {
      const known = COMMON.find((c) => c.name.toLowerCase() === typed);
      face =
        known?.emoji ??
        (await Promise.race([api.suggestEmoji(name.trim(), settings.useModel).catch(() => ""), new Promise<string>((r) => setTimeout(() => r(""), 1200))])) ??
        "";
    }
    const at = new Date(when).getTime() || Date.now();
    const ok = await store.saveFood(
      {
        id: initial?.id ?? "",
        name: name.trim(),
        emoji: face || "🍽️",
        meal,
        kcal,
        amount: info ? worked.amount : amountText.trim(),
        grams: info ? worked.grams : null,
        source: kcalTyped && source !== "label" ? (kcal != null ? "manual" : "") : source,
        barcode,
        note: note.trim(),
        at,
      },
      info ? { ...info, name: info.name || name.trim(), barcode: barcode || info.barcode } : null,
    );
    setSaving(false);
    if (ok) {
      sounds.step(1);
      onClose();
    }
  }

  return (
    <motion.div className="sheet-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="sheet food-sheet"
        role="dialog"
        aria-labelledby="food-title"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 330, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="sheet-head">
          <h2 id="food-title">{initial ? "Edit food" : "What did you have?"}</h2>
          <button className="btn btn-quiet btn-icon" onClick={onClose} aria-label="Close">
            <Close size={18} />
          </button>
        </div>

        <div className="sheet-body">
          <section className="group">
            <div className="food-name">
              {emoji && (
                <button className="food-emoji" aria-label="Clear emoji" onClick={() => setEmoji("")}>
                  {emoji}
                </button>
              )}
              <input
                className="field-input"
                placeholder="Porridge, 2 eggs, a sandwich…"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (source === "estimate" || source === "search") {
                    setInfo(null);
                    setSource("");
                  }
                  setResults(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && suggestions.common[0] && !picked && applyCommon(suggestions.common[0])}
                autoFocus={!initial && !start}
                aria-label="What you had"
              />
            </div>

            <div className="food-tools">
              {canUseCamera && (
                <>
                  <button className="btn btn-soft" onClick={() => void scan()} disabled={!!busy}>
                    <span aria-hidden>▥</span> Scan barcode
                  </button>
                  {showKcal && (
                    <button className="btn btn-soft" onClick={() => void label()} disabled={!!busy}>
                      <span aria-hidden>📷</span> Read the label
                    </button>
                  )}
                </>
              )}
              {!isAndroid && (
                <button className="btn btn-soft" onClick={() => setCodeOpen((v) => !v)} aria-expanded={codeOpen}>
                  Barcode number
                </button>
              )}
              {showKcal && name.trim().length >= 2 && !info && (
                <button className="btn btn-soft" onClick={() => void search()} disabled={!!busy}>
                  Search online
                </button>
              )}
            </div>

            {codeOpen && (
              <form
                className="food-code"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (code.replace(/\D/g, "").length >= 6) void lookUp(code.replace(/\D/g, ""));
                }}
              >
                <input className="field-input" inputMode="numeric" placeholder="The digits under the barcode" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
                <button className="btn btn-primary" disabled={code.replace(/\D/g, "").length < 6 || !!busy}>
                  Look up
                </button>
              </form>
            )}

            <AnimatePresence initial={false}>
              {busy && (
                <motion.p key="busy" className="hint food-busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {busy}
                </motion.p>
              )}
            </AnimatePresence>
            {message && <p className="hint food-message">{message}</p>}

            {(suggestions.mine.length > 0 || suggestions.common.length > 0) && (
              <div className="food-suggest" role="list" aria-label="Suggestions">
                {suggestions.mine.map((s) => (
                  <button key={s.id} role="listitem" className="food-option" onClick={() => applySaved(s)}>
                    <span className="food-option-emoji">{s.emoji || "🍽️"}</span>
                    <span className="food-option-text">
                      <span className="food-option-name">{s.name}</span>
                      <span className="food-option-meta">Had before{s.lastAmount ? ` · ${s.lastAmount}` : ""}</span>
                    </span>
                    {showKcal && s.lastKcal != null && <span className="food-option-kcal">{kcalText(s.lastKcal)}</span>}
                  </button>
                ))}
                {suggestions.common.map((c) => (
                  <button key={c.name} role="listitem" className="food-option" onClick={() => applyCommon(c)}>
                    <span className="food-option-emoji">{c.emoji}</span>
                    <span className="food-option-text">
                      <span className="food-option-name">{c.name}</span>
                      <span className="food-option-meta">{c.portion}</span>
                    </span>
                    {showKcal && <span className="food-option-kcal">{kcalText(c.kcal, true)}</span>}
                  </button>
                ))}
              </div>
            )}

            {results && results.length > 0 && (
              <div className="food-suggest" role="list" aria-label="Open Food Facts results">
                {results.map((r, i) => (
                  <button key={`${r.barcode}-${i}`} role="listitem" className="food-option" onClick={() => (sounds.tap(), applyInfo(r, "search"))}>
                    <span className="food-option-emoji">🛒</span>
                    <span className="food-option-text">
                      <span className="food-option-name">{r.name}</span>
                      <span className="food-option-meta">{[r.brand, r.servingText].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="food-option-kcal">{r.kcal100 != null ? `${Math.round(r.kcal100)} / 100 ${r.unit === "ml" ? "ml" : "g"}` : ""}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {info && (canPortion || canGrams) && (
            <section className="group">
              <h3>How much?</h3>
              {[canPortion, canGrams, canPack].filter(Boolean).length > 1 && (
                <div className="segmented small" role="radiogroup" aria-label="Measure by">
                  {canPortion && (
                    <button role="radio" aria-checked={mode === "portion"} className={mode === "portion" ? "is-on" : ""} onClick={() => (setMode("portion"), setKcalTyped(false))}>
                      Portions
                    </button>
                  )}
                  {canGrams && (
                    <button
                      role="radio"
                      aria-checked={mode === "grams"}
                      className={mode === "grams" ? "is-on" : ""}
                      onClick={() => {
                        setMode("grams");
                        setKcalTyped(false);
                        if (!grams) setGrams(String(info.servingG ?? 100));
                      }}
                    >
                      {unit === "ml" ? "Millilitres" : "Grams"}
                    </button>
                  )}
                  {canPack && (
                    <button role="radio" aria-checked={mode === "pack"} className={mode === "pack" ? "is-on" : ""} onClick={() => (setMode("pack"), setKcalTyped(false))}>
                      Whole pack
                    </button>
                  )}
                </div>
              )}
              {mode === "portion" && canPortion && (
                <div className="food-count">
                  <button className="btn btn-soft btn-icon" aria-label="Less" onClick={() => (setCount((c) => Math.max(0.5, c - 0.5)), setKcalTyped(false))}>
                    −
                  </button>
                  <span className="food-count-n" aria-live="polite">
                    {count}
                  </span>
                  <button className="btn btn-soft btn-icon" aria-label="More" onClick={() => (setCount((c) => Math.min(20, c + 0.5)), setKcalTyped(false))}>
                    +
                  </button>
                  <span className="food-count-what">× {info.servingText || "portion"}</span>
                </div>
              )}
              {mode === "grams" && canGrams && (
                <div className="reading">
                  <input
                    className="field-input reading-input"
                    inputMode="decimal"
                    value={grams}
                    onChange={(e) => (setGrams(e.target.value), setKcalTyped(false))}
                    aria-label={unit === "ml" ? "Millilitres" : "Grams"}
                  />
                  <span className="time-unit">{unit}</span>
                </div>
              )}
            </section>
          )}

          {!info && (
            <input className="field-input" placeholder="How much (optional): a bowl, 2 slices…" value={amountText} onChange={(e) => setAmountText(e.target.value)} aria-label="How much" />
          )}

          {showKcal && (
            <section className="group">
              <div className="food-kcal">
                <label className="food-kcal-field">
                  <span>Calories</span>
                  <input
                    className="field-input"
                    inputMode="decimal"
                    placeholder="Optional"
                    value={kcalTyped ? kcalInput : worked.kcal != null ? String(worked.kcal) : ""}
                    onChange={(e) => {
                      setKcalInput(e.target.value);
                      setKcalTyped(true);
                    }}
                  />
                  <span className="time-unit">kcal</span>
                </label>
              </div>
              {seen.length > 1 && (
                <div className="chips" aria-label="Numbers seen on the label">
                  <span className="hint">On the label:</span>
                  {seen.slice(0, 6).map((n) => (
                    <button key={n} className={`chip ${kcalTyped && num(kcalInput) === n ? "is-on" : ""}`} onClick={() => (setKcalInput(String(n)), setKcalTyped(true))}>
                      {n}
                    </button>
                  ))}
                </div>
              )}
              {SOURCE_TEXT[kcalTyped && source !== "label" ? "manual" : source] && <p className="hint">{SOURCE_TEXT[kcalTyped && source !== "label" ? "manual" : source]}</p>}
            </section>
          )}

          <div className="segmented small food-meals" role="radiogroup" aria-label="Meal">
            {MEALS.map((m) => (
              <button key={m.value} role="radio" aria-checked={meal === m.value} className={meal === m.value ? "is-on" : ""} onClick={() => setMeal(m.value)}>
                {meal === m.value && <motion.span layoutId="meal-pill" className="pill-bg" />}
                <span>{m.label}</span>
              </button>
            ))}
          </div>

          <textarea className="notes" rows={2} placeholder="Anything worth remembering" value={note} onChange={(e) => setNote(e.target.value)} />
          <label className="date-pair one">
            <span>When</span>
            <input type="datetime-local" className="field-input" value={when} onChange={(e) => e.target.value && setWhen(e.target.value)} />
          </label>
        </div>

        <div className="sheet-foot">
          <button className="btn btn-primary btn-wide" disabled={!ready} onClick={() => void save()}>
            {initial ? (
              "Save changes"
            ) : (
              <>
                Add{showKcal && kcal != null ? ` · ${kcalText(kcal)}` : ""} · <Seed size={14} /> 2
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
