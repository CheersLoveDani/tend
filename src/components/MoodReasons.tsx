import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { api, type Entry, type MoodReason } from "../lib/api";
import { sounds } from "../lib/sound";
import { Check, Close, Plus } from "./Icons";

/** A spread of emoji for picking by hand: feelings, people, places, things, weather, nature. */
export const EMOJI_CHOICES = [
  "😴", "💼", "📚", "👯", "🏡", "❤️", "👶", "🐶", "🐱", "🩺", "🤒", "🤕", "💊", "🛋️", "🧘", "🏃",
  "🚶", "🏋️", "🌳", "🌱", "☀️", "🌧️", "🌦️", "❄️", "🍽️", "☕", "🍷", "🍫", "💸", "🛍️", "🧹", "🧺",
  "🎵", "🎮", "📖", "🎬", "🎨", "✍️", "📱", "📰", "🚌", "✈️", "🎉", "🎂", "🏆", "✅", "😰", "😵‍💫",
  "😤", "😢", "🥱", "🤯", "🫂", "🗣️", "🔥", "🌙", "💭", "✨", "🧩", "🙏", "🌊", "⚡",
];

const norm = (s: string) => s.trim().toLowerCase();
export const sameReason = (a: MoodReason, b: MoodReason) => norm(a.label) === norm(b.label);

/** Debounced emoji suggestion from the on-device helper (keyword fallback when it's off). */
export function useEmojiGuess(text: string, useModel: boolean) {
  const [guess, setGuess] = useState<string | null>(null);
  useEffect(() => {
    const t = text.trim();
    if (t.length < 2) return setGuess(null);
    let live = true;
    const timer = window.setTimeout(() => {
      api
        .suggestEmoji(t, useModel)
        .then((e) => live && setGuess(e || null))
        .catch(() => null);
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [text, useModel]);
  return guess;
}

/** A small grid of emoji to choose from. */
export function EmojiGrid({ value, onPick, reduceMotion }: { value: string; onPick: (e: string) => void; reduceMotion?: boolean }) {
  return (
    <motion.div
      className="emoji-grid"
      role="listbox"
      aria-label="Pick an emoji"
      initial={reduceMotion ? false : { opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <div className="emoji-grid-inner">
        {EMOJI_CHOICES.map((e) => (
          <button key={e} role="option" aria-selected={e === value} className={`emoji-cell ${e === value ? "is-on" : ""}`} onClick={() => onPick(e)}>
            {e}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

/**
 * "What's behind it?" — shown under the weather faces once one is picked. Tap the usual reasons, or
 * type your own: the helper suggests an emoji (tap it to choose another), and a tick keeps it as a
 * regular option. Saves as you go, onto today's check-in.
 */
export function ReasonsPanel({
  entry,
  options,
  useModel,
  reduceMotion,
  onSave,
  onAddOption,
}: {
  entry: Entry;
  options: MoodReason[];
  useModel: boolean;
  reduceMotion?: boolean;
  onSave: (reasons: MoodReason[]) => void;
  onAddOption: (r: MoodReason) => void;
}) {
  const [chosen, setChosen] = useState<MoodReason[]>(entry.reasons ?? []);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null); // picked by hand; overrides the guess
  const [picking, setPicking] = useState(false);
  const [keep, setKeep] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const guess = useEmojiGuess(text, useModel);
  const shownEmoji = emoji ?? guess ?? "💭";

  // Another device or a change of weather may bring new reasons in.
  const entryKey = (entry.reasons ?? []).map((r) => r.label).join("|");
  useEffect(() => setChosen(entry.reasons ?? []), [entry.id, entryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (next: MoodReason[]) => {
    setChosen(next);
    onSave(next);
  };
  const toggle = (r: MoodReason) => {
    sounds.tap();
    const on = chosen.some((c) => sameReason(c, r));
    save(on ? chosen.filter((c) => !sameReason(c, r)) : [...chosen, r]);
  };

  const addTyped = () => {
    const label = text.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!label) return;
    const r = { label: label[0].toUpperCase() + label.slice(1), emoji: shownEmoji };
    sounds.tap();
    if (!chosen.some((c) => sameReason(c, r))) save([...chosen, r]);
    if (keep && !options.some((o) => sameReason(o, r))) onAddOption(r);
    setText("");
    setEmoji(null);
    setPicking(false);
    setTyping(false);
  };

  // Chosen ones that aren't regular options still show, so they can be un-ticked.
  const extras = chosen.filter((c) => !options.some((o) => sameReason(o, c)));
  const chips = [...options, ...extras];
  const ease = reduceMotion ? { duration: 0 } : { type: "spring" as const, stiffness: 380, damping: 26 };

  return (
    <div className="reasons">
      <p className="reasons-ask">What's behind it?</p>
      <div className="chips reasons-chips">
        {chips.map((r, i) => {
          const on = chosen.some((c) => sameReason(c, r));
          return (
            <motion.button
              key={norm(r.label)}
              className={`chip reason-chip ${on ? "is-on" : ""}`}
              aria-pressed={on}
              initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...ease, delay: reduceMotion ? 0 : Math.min(i, 12) * 0.025 }}
              whileTap={reduceMotion ? undefined : { scale: 0.93 }}
              onClick={() => toggle(r)}
            >
              <span aria-hidden>{r.emoji}</span> {r.label}
              {on && <Check size={13} />}
            </motion.button>
          );
        })}
        {!typing && (
          <motion.button
            className="chip reason-chip reason-add"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => {
              setTyping(true);
              window.setTimeout(() => input.current?.focus(), 30);
            }}
          >
            <Plus size={13} /> Something else
          </motion.button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {typing && (
          <motion.div
            key="typed"
            className="reason-new"
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <div className="reason-new-row">
              <button
                className={`reason-emoji ${picking ? "is-open" : ""}`}
                aria-label={`Emoji ${shownEmoji}. Choose another`}
                aria-expanded={picking}
                onClick={() => setPicking((p) => !p)}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={shownEmoji}
                    initial={reduceMotion ? false : { scale: 0.3, rotate: -40, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    exit={{ scale: 0.3, opacity: 0 }}
                    transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 18 }}
                  >
                    {shownEmoji}
                  </motion.span>
                </AnimatePresence>
              </button>
              <input
                ref={input}
                value={text}
                maxLength={40}
                placeholder="In your own words"
                aria-label="What's behind it, in your own words"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addTyped();
                  if (e.key === "Escape") setTyping(false);
                }}
              />
              <button className="btn btn-primary btn-small" disabled={!text.trim()} onClick={addTyped}>
                Add
              </button>
              <button className="btn btn-quiet btn-icon" aria-label="Cancel" onClick={() => setTyping(false)}>
                <Close size={15} />
              </button>
            </div>
            <AnimatePresence initial={false}>
              {picking && (
                <EmojiGrid
                  key="grid"
                  value={shownEmoji}
                  reduceMotion={reduceMotion}
                  onPick={(e) => {
                    sounds.tap();
                    setEmoji(e);
                    setPicking(false);
                  }}
                />
              )}
            </AnimatePresence>
            <label className="reason-keep">
              <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
              <span>Keep it as a regular option</span>
            </label>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Settings: the regular reasons, each with its emoji (tap to change), renameable and removable. */
export function ReasonOptionsEditor({
  options,
  useModel,
  reduceMotion,
  onChange,
}: {
  options: MoodReason[];
  useModel: boolean;
  reduceMotion?: boolean;
  onChange: (next: MoodReason[]) => void;
}) {
  const [picking, setPicking] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [newPicking, setNewPicking] = useState(false);
  const guess = useEmojiGuess(text, useModel);
  const shown = emoji ?? guess ?? "💭";

  const update = (i: number, patch: Partial<MoodReason>) => onChange(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const add = () => {
    const label = text.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!label) return;
    const r = { label: label[0].toUpperCase() + label.slice(1), emoji: shown };
    if (!options.some((o) => sameReason(o, r))) onChange([...options, r]);
    setText("");
    setEmoji(null);
    setNewPicking(false);
  };

  return (
    <div className="reason-editor">
      <ul className="reason-edit-list">
        <AnimatePresence initial={false}>
          {options.map((o, i) => (
            <motion.li
              key={norm(o.label) || i}
              layout={!reduceMotion}
              initial={reduceMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            >
              <div className="reason-edit-row">
                <button
                  className={`reason-emoji ${picking === i ? "is-open" : ""}`}
                  aria-label={`Emoji for ${o.label}: ${o.emoji}. Choose another`}
                  aria-expanded={picking === i}
                  onClick={() => setPicking(picking === i ? null : i)}
                >
                  {o.emoji}
                </button>
                <input
                  value={o.label}
                  maxLength={40}
                  aria-label={`Reason ${i + 1}`}
                  onChange={(e) => update(i, { label: e.target.value })}
                  onBlur={(e) => !e.target.value.trim() && onChange(options.filter((_, j) => j !== i))}
                />
                <button className="btn btn-quiet btn-icon" aria-label={`Remove ${o.label}`} onClick={() => onChange(options.filter((_, j) => j !== i))}>
                  <Close size={15} />
                </button>
              </div>
              <AnimatePresence initial={false}>
                {picking === i && (
                  <EmojiGrid
                    key="grid"
                    value={o.emoji}
                    reduceMotion={reduceMotion}
                    onPick={(e) => {
                      update(i, { emoji: e });
                      setPicking(null);
                    }}
                  />
                )}
              </AnimatePresence>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <div className="reason-edit-row is-new">
        <button className={`reason-emoji ${newPicking ? "is-open" : ""}`} aria-label={`Emoji ${shown}. Choose another`} onClick={() => setNewPicking((p) => !p)}>
          {shown}
        </button>
        <input value={text} maxLength={40} placeholder="Add a reason" aria-label="Add a reason" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn btn-soft btn-small" disabled={!text.trim()} onClick={add}>
          Add
        </button>
      </div>
      <AnimatePresence initial={false}>
        {newPicking && (
          <EmojiGrid
            key="new-grid"
            value={shown}
            reduceMotion={reduceMotion}
            onPick={(e) => {
              setEmoji(e);
              setNewPicking(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
