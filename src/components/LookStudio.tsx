import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { useMemo, useRef, useState } from "react";
import {
  GROUPS,
  KINDS,
  PALETTE,
  colorName,
  describeLook,
  kindOf,
  newLook,
  optsFor,
  sameLook,
  surprise,
  switchKind,
  tiltFor,
  type MedLook,
  type Opt,
  type OptValue,
} from "../lib/medLook";
import { sounds } from "../lib/sound";
import { MedArt } from "./MedArt";
import { Close } from "./Icons";

interface Props {
  initial: MedLook;
  name: string;
  onDone: (look: MedLook) => void;
  onClose: () => void;
}

const TABS = ["Type", "Shape", "Colours", "Details"] as const;
type Tab = (typeof TABS)[number];

export function LookStudio({ initial, name, onDone, onClose }: Props) {
  const [look, setLook] = useState<MedLook>(initial);
  const [tab, setTab] = useState<Tab>("Type");
  const [dir, setDir] = useState(1);
  const [slot, setSlot] = useState(0);
  const [face, setFace] = useState<"front" | "back">("front");
  const [query, setQuery] = useState("");
  const stage = useAnimationControls();
  const kind = kindOf(look.kind);
  const main = look.kind === "drops" ? look.colors[2] : look.colors[0];
  const flippable = look.kind === "tablet";

  function update(next: MedLook, bounce = true) {
    setLook(next);
    if (bounce) void stage.start({ scale: [1, 1.07, 1], transition: { duration: 0.35 } });
  }

  function goTab(t: Tab) {
    setDir(TABS.indexOf(t) >= TABS.indexOf(tab) ? 1 : -1);
    setTab(t);
    sounds.tap();
  }

  function pickKind(id: string) {
    if (id === look.kind) return goTab("Shape");
    sounds.tap();
    setSlot(0);
    setFace("front");
    update(switchKind(look, id));
  }

  function pickShape(id: string) {
    sounds.tap();
    const turned = look.tilt === tiltFor(look.kind, look.shape);
    update({ ...look, shape: id, tilt: turned ? tiltFor(look.kind, id) : look.tilt });
  }

  function setColor(hex: string) {
    const colors = [...look.colors];
    colors[slot] = hex;
    update({ ...look, colors }, false);
  }

  function setOpt(key: string, v: OptValue, bounce = true) {
    update({ ...look, opts: { ...look.opts, [key]: v } }, bounce);
  }

  async function flip() {
    sounds.tap();
    await stage.start({ scaleX: 0, transition: { duration: 0.16, ease: "easeIn" } });
    setFace((f) => (f === "front" ? "back" : "front"));
    await stage.start({ scaleX: 1, transition: { type: "spring", stiffness: 420, damping: 22 } });
  }

  // Drag across the stage to turn it.
  const drag = useRef<{ x: number; tilt: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, tilt: look.tilt };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    let t = Math.round(drag.current.tilt + (e.clientX - drag.current.x) * 0.9);
    t = ((((t + 180) % 360) + 360) % 360) - 180;
    // Settle onto neat angles when close.
    const snap = [-90, -45, 0, 45, 90].find((a) => Math.abs(a - t) < 4);
    setLook((l) => ({ ...l, tilt: snap ?? t }));
  };
  const onUp = () => (drag.current = null);

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return KINDS.filter((k) => `${k.label} ${k.words} ${k.shapes.map((s) => s.label).join(" ")}`.toLowerCase().includes(q));
  }, [query]);

  const changed = !sameLook(look, initial);
  const description = describeLook(look);

  return (
    <motion.div className="sheet-scrim look-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="sheet look-studio"
        role="dialog"
        aria-label="How it looks"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 330, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onClose())}
      >
        <div className="sheet-head">
          <h2>How it looks</h2>
          <button className="btn btn-quiet btn-icon" onClick={onClose} aria-label="Close">
            <Close size={18} />
          </button>
        </div>

        <motion.div
          className="ls-stage"
          style={{ ["--stage-tint" as string]: main }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onDoubleClick={() => setLook((l) => ({ ...l, tilt: tiltFor(l.kind, l.shape) }))}
        >
          <motion.div className="ls-float" animate={{ y: [0, -5, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}>
            <motion.div animate={stage}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={look.kind + look.shape}
                  initial={{ scale: 0.4, rotate: -25, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  exit={{ scale: 0.4, rotate: 25, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 360, damping: 20 }}
                >
                  <MedArt look={look} face={face} size={176} shadow title={description} />
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </motion.div>
          <div className="ls-stage-tools" onPointerDown={(e) => e.stopPropagation()}>
            {flippable && (
              <button className="ls-tool" onClick={() => void flip()} aria-label={face === "front" ? "Show the back" : "Show the front"}>
                <FlipIcon /> {face === "front" ? "Back" : "Front"}
              </button>
            )}
            <button
              className="ls-tool"
              onClick={() => {
                sounds.bit();
                setFace("front");
                update(surprise(look));
              }}
              aria-label="Surprise me with a look"
            >
              <DiceIcon /> Surprise
            </button>
          </div>
          <span className="ls-hint">Drag to turn</span>
        </motion.div>

        <div className="ls-caption" aria-live="polite">
          {name.trim() && <strong>{name.trim()}</strong>}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={description} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
              {description}
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="segmented ls-tabs" role="tablist" aria-label="Look settings">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "is-on" : ""} onClick={() => goTab(t)}>
              {tab === t && <motion.span layoutId="ls-tab-pill" className="pill-bg" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
              <span>{t}</span>
            </button>
          ))}
        </div>

        <div className="sheet-body ls-body">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div
              key={tab}
              custom={dir}
              initial={{ opacity: 0, x: 24 * dir }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 * dir }}
              transition={{ duration: 0.18 }}
            >
              {tab === "Type" && (
                <div className="ls-types">
                  <input
                    className="field-input ls-search"
                    type="search"
                    placeholder="Search: insulin pen, gummy, eye drops…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search kinds of medication"
                  />
                  {found ? (
                    found.length ? (
                      <KindGrid kinds={found.map((k) => k.id)} current={look.kind} onPick={pickKind} />
                    ) : (
                      <p className="hint">Nothing by that name yet. "Tablet" or "Bottle" can be shaped into most things.</p>
                    )
                  ) : (
                    GROUPS.map((g) => (
                      <section key={g} className="ls-group">
                        <h4>{g}</h4>
                        <KindGrid kinds={KINDS.filter((k) => k.group === g).map((k) => k.id)} current={look.kind} onPick={pickKind} />
                      </section>
                    ))
                  )}
                </div>
              )}

              {tab === "Shape" && (
                <div className="ls-grid" role="radiogroup" aria-label={`${kind.label} shape`}>
                  {kind.shapes.map((s, i) => {
                    const preview = { ...look, shape: s.id, tilt: tiltFor(look.kind, s.id) };
                    return (
                      <motion.button
                        key={s.id}
                        role="radio"
                        aria-checked={look.shape === s.id}
                        className={`ls-tile ${look.shape === s.id ? "is-on" : ""}`}
                        onClick={() => pickShape(s.id)}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.02, 0.3) }}
                        whileTap={{ scale: 0.92 }}
                      >
                        {look.shape === s.id && <motion.span layoutId="ls-shape-ring" className="ls-ring" />}
                        <MedArt look={preview} size={52} />
                        <span>{s.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {tab === "Colours" && (
                <div className="ls-colours">
                  <div className="ls-slots" role="radiogroup" aria-label="Part to colour">
                    {kind.slots.map((s, i) => (
                      <button key={s} role="radio" aria-checked={slot === i} className={`ls-slot ${slot === i ? "is-on" : ""}`} onClick={() => (sounds.tap(), setSlot(i))}>
                        {slot === i && <motion.span layoutId="ls-slot-pill" className="pill-bg" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
                        <span className="ls-dot" style={{ background: look.colors[i] }} />
                        <span>{s}</span>
                      </button>
                    ))}
                    {kind.slots.length > 1 && (
                      <button
                        className="ls-slot ls-swap"
                        onClick={() => {
                          sounds.tap();
                          const c = [...look.colors];
                          [c[0], c[1]] = [c[1], c[0]];
                          update({ ...look, colors: c });
                        }}
                        aria-label={`Swap ${kind.slots[0]} and ${kind.slots[1]} colours`}
                      >
                        <SwapIcon /> Swap
                      </button>
                    )}
                  </div>
                  <div className="ls-palette" role="radiogroup" aria-label={`${kind.slots[slot]} colour`}>
                    {PALETTE.map((row, r) => (
                      <div key={r} className="ls-row">
                        {row.map((c) => {
                          const sel = look.colors[slot]?.toLowerCase() === c.hex.toLowerCase();
                          return (
                            <motion.button
                              key={c.hex}
                              role="radio"
                              aria-checked={sel}
                              aria-label={c.name}
                              title={c.name}
                              className="ls-swatch"
                              style={{ background: c.hex }}
                              onClick={() => (sounds.tap(), setColor(c.hex))}
                              whileTap={{ scale: 0.85 }}
                            >
                              {sel && <motion.span layoutId="ls-swatch-ring" className="ls-swatch-ring" transition={{ type: "spring", stiffness: 500, damping: 30 }} />}
                            </motion.button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <label className="ls-custom">
                    <span className="ls-custom-chip" style={{ background: look.colors[slot] }}>
                      <input type="color" value={look.colors[slot]} onChange={(e) => setColor(e.target.value)} aria-label="Any colour" />
                    </span>
                    <span>
                      Any colour
                      <span className="row-hint">Now: {colorName(look.colors[slot])}</span>
                    </span>
                  </label>
                </div>
              )}

              {tab === "Details" && (
                <div className="ls-details">
                  {optsFor(look).map((o) => (
                    <OptRow key={o.key} opt={o} look={look} face={face} onChange={setOpt} />
                  ))}
                  <div className="ls-opt">
                    <div className="ls-opt-head">
                      <span>Turn</span>
                      <button className="btn btn-quiet ls-mini" onClick={() => (sounds.tap(), update({ ...look, tilt: tiltFor(look.kind, look.shape) }))}>
                        Straighten
                      </button>
                    </div>
                    <input
                      type="range"
                      className="ls-range"
                      min={-180}
                      max={180}
                      step={5}
                      value={look.tilt}
                      onChange={(e) => update({ ...look, tilt: Number(e.target.value) }, false)}
                      aria-label="Turn"
                    />
                  </div>
                  {optsFor(look).length === 0 && <p className="hint">This one is all about shape and colour.</p>}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="sheet-foot ls-foot">
          <button className="btn btn-soft" disabled={!changed} onClick={() => (sounds.undo(), setFace("front"), update(initial))}>
            Undo changes
          </button>
          <button className="btn btn-primary" onClick={() => (sounds.step(1), onDone(look))}>
            Use this look
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function KindGrid({ kinds, current, onPick }: { kinds: string[]; current: string; onPick: (id: string) => void }) {
  return (
    <div className="ls-grid" role="radiogroup">
      {kinds.map((id, i) => {
        const k = kindOf(id);
        return (
          <motion.button
            key={id}
            role="radio"
            aria-checked={current === id}
            className={`ls-tile ${current === id ? "is-on" : ""}`}
            onClick={() => onPick(id)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.025, 0.25) }}
            whileTap={{ scale: 0.92 }}
          >
            {current === id && <motion.span layoutId="ls-kind-ring" className="ls-ring" />}
            <MedArt look={newLook(id)} size={52} />
            <span>{k.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

function OptRow({ opt, look, face, onChange }: { opt: Opt; look: MedLook; face: "front" | "back"; onChange: (key: string, v: OptValue, bounce?: boolean) => void }) {
  const v = look.opts[opt.key];
  if (opt.type === "toggle") {
    const checked = v === true;
    return (
      <label className="ls-opt ls-opt-toggle">
        <span>
          {opt.label}
          {opt.hint && <span className="row-hint">{opt.hint}</span>}
        </span>
        <button role="switch" aria-checked={checked} className={`switch ${checked ? "is-on" : ""}`} onClick={() => (sounds.tap(), onChange(opt.key, !checked))}>
          <motion.span className="switch-knob" layout transition={{ type: "spring", stiffness: 500, damping: 32 }} />
        </button>
      </label>
    );
  }
  if (opt.type === "text") {
    return (
      <label className="ls-opt">
        <span className="ls-opt-head">
          <span>{opt.label}</span>
          <span className="row-hint">
            {String(v ?? "").length}/{opt.max}
          </span>
        </span>
        <input
          className="field-input ls-text"
          value={String(v ?? "")}
          maxLength={opt.max}
          placeholder={opt.placeholder}
          onChange={(e) => onChange(opt.key, e.target.value.toUpperCase(), false)}
        />
      </label>
    );
  }
  if (opt.type === "range") {
    const n = typeof v === "number" ? v : opt.def;
    return (
      <label className="ls-opt">
        <span className="ls-opt-head">
          <span>{opt.label}</span>
          <span className="row-hint">
            {n}
            {opt.unit ?? ""}
          </span>
        </span>
        <input type="range" className="ls-range" min={opt.min} max={opt.max} step={opt.step} value={n} onChange={(e) => onChange(opt.key, Number(e.target.value), false)} />
      </label>
    );
  }
  // Choices show what each one would look like.
  const showArt = opt.choices.length <= 8;
  return (
    <div className="ls-opt">
      <span className="ls-opt-head">
        <span>{opt.label}</span>
      </span>
      <div className="ls-choices" role="radiogroup" aria-label={opt.label}>
        {opt.choices.map((c) => {
          const on = v === c.value;
          return (
            <motion.button
              key={c.value}
              role="radio"
              aria-checked={on}
              className={`ls-choice ${on ? "is-on" : ""}`}
              onClick={() => (sounds.tap(), onChange(opt.key, c.value))}
              whileTap={{ scale: 0.92 }}
            >
              {showArt && <MedArt look={{ ...look, opts: { ...look.opts, [opt.key]: c.value } }} face={opt.key === "imprintBack" ? "back" : face} size={34} />}
              <span>{c.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

const FlipIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3v18M8 7l-4 5 4 5M16 7l4 5-4 5" />
  </svg>
);
const DiceIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <circle cx="9" cy="9" r="1" fill="currentColor" />
    <circle cx="15" cy="15" r="1" fill="currentColor" />
    <circle cx="15" cy="9" r="1" fill="currentColor" />
    <circle cx="9" cy="15" r="1" fill="currentColor" />
  </svg>
);
const SwapIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
  </svg>
);
