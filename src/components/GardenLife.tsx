import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { format, parseISO } from "date-fns";
import { useStore } from "../lib/store";
import { CHEER_EVENT } from "../lib/cheer";
import { creatureName, fieldNotes, gardenOn, guessSouth, type Creature, type Place, type WildlifeOptions } from "../lib/wildlife";
import { Critter, Nest, SPECIES_INFO, type Pose, type Species } from "./Critters";
import { Close } from "./Icons";

/** Where things can be, as % of the tree's box (feet at the point). */
function spots(level: number): Record<Place, { x: [number, number]; y: [number, number] }> {
  const grown = Math.min(1, Math.sqrt(Math.max(0, level - 3) / 20));
  return {
    ground: { x: [10, 90], y: [93, 96] },
    branch:
      level <= 3
        ? { x: [20, 80], y: [93, 96] } // no branches yet: everyone's on the ground by the sprout
        : { x: [50 - 10 - grown * 16, 50 + 10 + grown * 16], y: [52 - grown * 22, 60 - grown * 8] },
    air: { x: [6, 94], y: [8, 30] },
  };
}

/** Browser preview only: ?gardenDate=2026-04-28 shows the garden on another day (nests are in spring). */
const today = () => {
  const p = new URLSearchParams(location.search).get("gardenDate");
  const d = p ? new Date(`${p}T12:00`) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const isEvening = (d = new Date()) => d.getHours() >= 19 || d.getHours() < 6;
const SIZE: Partial<Record<Species, number>> = { wren: 32, bluetit: 32, swallow: 42, butterfly: 26, hedgehog: 46, squirrel: 44, robin: 34, owl: 40 };

interface Spot {
  x: number;
  y: number;
  place: Place;
}

function pick(c: Creature, level: number, prev?: Spot): Spot {
  const all = spots(level);
  const place = c.places[Math.floor(Math.random() * c.places.length)];
  const s = all[place];
  let x = rand(s.x[0], s.x[1]);
  // Don't wander off screen-edge to screen-edge in one go.
  if (prev && Math.abs(x - prev.x) > 45) x = prev.x + Math.sign(x - prev.x) * 45;
  return { x, y: rand(s.y[0], s.y[1]), place };
}

/** One creature, wandering in its own time. */
function Wanderer({
  c,
  level,
  still,
  excited,
  arriving,
  onTap,
}: {
  c: Creature;
  level: number;
  still: boolean;
  excited: boolean;
  arriving: boolean;
  onTap: () => void;
}) {
  const asleep = c.evening && !isEvening();
  const [spot, setSpot] = useState<Spot>(() => {
    const s = pick(c, level);
    // Arriving: fly in from above the sky.
    return arriving && !still ? { x: s.x < 50 ? -8 : 108, y: 4, place: "air" } : s;
  });
  const [moving, setMoving] = useState(false);
  const [facing, setFacing] = useState<1 | -1>(Math.random() < 0.5 ? 1 : -1);

  useEffect(() => {
    if (still || asleep) return;
    let timer: number;
    const next = (first = false) => {
      timer = window.setTimeout(
        () => {
          setSpot((prev) => {
            const to = pick(c, level, prev);
            setFacing(to.x >= prev.x ? 1 : -1);
            return to;
          });
          setMoving(true);
          next();
        },
        first && arriving ? 300 : rand(7000, 18000),
      );
    };
    next(true);
    return () => window.clearTimeout(timer);
  }, [still, asleep, level, c, arriving]);

  const size = SIZE[c.species] ?? 28;
  const pose: Pose = asleep ? "sleep" : moving ? (spot.place === "air" || c.species === "swallow" || c.species === "butterfly" ? "fly" : c.places.includes("ground") && spot.place === "ground" ? "walk" : "hop") : "idle";

  return (
    <motion.button
      className="wl-creature"
      aria-label={c.species === "wren" ? "Your wren" : SPECIES_INFO[c.species].name}
      style={{ width: size }}
      initial={false}
      animate={{ left: `${spot.x}%`, top: `${spot.y}%` }}
      transition={still ? { duration: 0 } : { duration: spot.place === "air" ? 2.6 : 3.4, ease: "easeInOut" }}
      onAnimationComplete={() => setMoving(false)}
      onClick={onTap}
    >
      <Critter species={c.species} size={size} pose={pose} facing={facing} still={still} excited={excited && !asleep} />
    </motion.button>
  );
}

/**
 * The wildlife over the Garden's tree (`layer`, placed with the tree) and the line under it (`caption`): whoever lives there or is visiting today, wandering
 * about, plus a nest in spring. Taps show who it is; good news makes everyone hop.
 */
export function useGardenLife(level: number): { layer: ReactElement | null; caption: ReactElement | null } {
  const { settings, updateSettings, snap, reduceMotion } = useStore();
  const [excited, setExcited] = useState(false);
  const [selected, setSelected] = useState<Creature | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [movingIn, setMovingIn] = useState(false);

  // The wren moves in the first time something's been finished (seeds gathered).
  useEffect(() => {
    if (!settings.wildlife || settings.wildlifeSince || !snap || snap.level.xp <= 0) return;
    setMovingIn(true);
    updateSettings({ wildlifeSince: Date.now() });
  }, [settings.wildlife, settings.wildlifeSince, snap, updateSettings]);

  useEffect(() => {
    let t: number | undefined;
    const on = () => {
      setExcited(true);
      window.clearTimeout(t);
      t = window.setTimeout(() => setExcited(false), 900);
    };
    window.addEventListener(CHEER_EVENT, on);
    return () => {
      window.removeEventListener(CHEER_EVENT, on);
      window.clearTimeout(t);
    };
  }, []);

  const opts: WildlifeOptions | null = settings.wildlifeSince
    ? { since: settings.wildlifeSince, kept: settings.wildlifeKept, level, south: settings.wildlifeSouth ?? guessSouth() }
    : null;
  const dayKey = format(today(), "yyyy-MM-dd");
  const garden = useMemo(() => (opts ? gardenOn(today(), opts) : null), [dayKey, opts?.since, opts?.kept.join(), level, opts?.south]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!settings.wildlife || !garden || !opts) return { layer: null, caption: null };
  const name = settings.wildlifeName || "Pip";
  const nestSpot = spots(level).branch;

  const layer = (
      <div className="wl-layer" aria-label="Wildlife in your garden">
        {garden.nest && (
          <div className="wl-nest" style={{ left: `${(nestSpot.x[0] + nestSpot.x[1]) / 2 + 6}%`, top: `${nestSpot.y[1] - 2}%` }}>
            <Nest size={30} eggs={garden.nest.eggs} chicks={garden.nest.chicks} still={reduceMotion} />
          </div>
        )}
        {garden.creatures.map((c) => (
          <Wanderer
            key={c.key}
            c={c}
            level={level}
            still={reduceMotion}
            excited={excited}
            arriving={(c.species === "wren" && movingIn) || garden.arrived.includes(c.species)}
            onTap={() => setSelected(c)}
          />
        ))}
      </div>
  );
  const caption = (
    <>
      <GardenCaption
        garden={garden}
        name={name}
        movingIn={movingIn}
        selected={selected}
        onClose={() => setSelected(null)}
        kept={settings.wildlifeKept}
        onKeep={(s, keep) => updateSettings({ wildlifeKept: keep ? [...new Set([...settings.wildlifeKept, s])] : settings.wildlifeKept.filter((k) => k !== s) })}
        onNotes={() => setNotesOpen(true)}
        reduceMotion={reduceMotion}
      />
      <AnimatePresence>{notesOpen && <FieldNotesSheet key="notes" opts={opts} name={name} onClose={() => setNotesOpen(false)} />}</AnimatePresence>
    </>
  );
  return { layer, caption };
}

const LINES: Partial<Record<Species, string>> = {
  bluetit: "Busy and bright, always flitting between twigs.",
  swallow: "Here for the warm months, swooping after insects.",
  butterfly: "Drifting from leaf to leaf in the sun.",
  hedgehog: "Snuffling about under the tree, on its rounds.",
  squirrel: "Very busy hiding things for later.",
  robin: "Keeps you company through the cold months.",
  owl: "Dozes in the tree by day and wakes at dusk.",
};

function GardenCaption({
  garden,
  name,
  movingIn,
  selected,
  onClose,
  kept,
  onKeep,
  onNotes,
  reduceMotion,
}: {
  garden: ReturnType<typeof gardenOn>;
  name: string;
  movingIn: boolean;
  selected: Creature | null;
  onClose: () => void;
  kept: string[];
  onKeep: (s: Species, keep: boolean) => void;
  onNotes: () => void;
  reduceMotion: boolean;
}) {
  const fade = reduceMotion ? { initial: false as const } : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 } };
  const visitorLine = garden.arrived.length
    ? `${cap(SPECIES_INFO[garden.arrived[0]].name)} has turned up in the garden.`
    : garden.left[0]?.text ?? null;

  let body: { key: string; text: string; action?: { label: string; run: () => void } };
  if (selected) {
    const who = creatureName(selected, name, SPECIES_INFO);
    const line =
      selected.species === "wren"
        ? `${name} lives in your tree. Happy whatever the weather.`
        : selected.role === "fledgling"
          ? "Hatched in your tree and decided to stay."
          : (LINES[selected.species] ?? "Just passing through.");
    const canKeep = selected.role === "visitor" && selected.key !== "nesting-pair";
    const isKept = selected.role === "kept";
    body = {
      key: `sel-${selected.key}`,
      text: `${cap(who)}. ${line}${isKept ? " Staying for good." : ""}`,
      action: canKeep
        ? { label: "Ask them to stay", run: () => (onKeep(selected.species, true), onClose()) }
        : isKept
          ? { label: "Let them come and go", run: () => (onKeep(selected.species, false), onClose()) }
          : undefined,
    };
  } else if (movingIn) {
    body = { key: "moved-in", text: `Someone's moved into your tree. Say hello to ${name} the wren.` };
  } else if (garden.nest) {
    body = {
      key: `nest-${garden.nest.phase}`,
      text:
        garden.nest.phase === "building"
          ? "A pair of blue tits are building a nest in your tree."
          : garden.nest.phase === "eggs"
            ? `${garden.nest.eggs} tiny eggs in the nest. The blue tits take turns keeping them warm.`
            : `${garden.nest.chicks} chicks in the nest, beaks wide open.`,
    };
  } else if (visitorLine) {
    body = { key: `v-${visitorLine}`, text: visitorLine };
  } else {
    body = { key: "home", text: `${name} is pottering about the tree.` };
  }
  void kept;

  return (
    <div className="wl-caption">
      <AnimatePresence mode="wait">
        <motion.p key={body.key} className="wl-caption-text" {...fade} transition={{ duration: 0.25 }}>
          {body.text}
        </motion.p>
      </AnimatePresence>
      <div className="wl-caption-actions">
        {body.action && (
          <button className="btn btn-soft btn-small" onClick={body.action.run}>
            {body.action.label}
          </button>
        )}
        {selected ? (
          <button className="btn btn-quiet btn-icon" aria-label="Close" onClick={onClose}>
            <Close size={14} />
          </button>
        ) : (
          <button className="btn btn-quiet btn-small" onClick={onNotes}>
            Field notes
          </button>
        )}
      </div>
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Everyone who's lived in or visited the garden, and what happened. Only ever grows. */
function FieldNotesSheet({ opts, name, onClose }: { opts: WildlifeOptions; name: string; onClose: () => void }) {
  const { reduceMotion } = useStore();
  const { notes, tally } = useMemo(() => fieldNotes(today(), opts, name), [opts, name]);
  const list = useRef<HTMLDivElement>(null);
  return (
    <motion.div className="sheet-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="sheet wl-notes"
        role="dialog"
        aria-labelledby="wl-notes-title"
        initial={reduceMotion ? { opacity: 0 } : { y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 330, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="sheet-head">
          <div>
            <p className="view-kicker">Your garden</p>
            <h2 id="wl-notes-title">Field notes</h2>
          </div>
          <button className="btn btn-quiet btn-icon" aria-label="Close" onClick={onClose}>
            <Close size={16} />
          </button>
        </div>
        <div className="sheet-body" ref={list}>
          <div className="wl-tally">
            <div className="wl-tally-item">
              <Critter species="wren" size={30} still />
              <span>
                <strong>{name}</strong>
                <span className="row-hint">Lives here</span>
              </span>
            </div>
            {tally.map((t) => (
              <div key={t.species} className="wl-tally-item">
                <Critter species={t.species} size={30} still />
                <span>
                  <strong>{cap(SPECIES_INFO[t.species].name)}</strong>
                  <span className="row-hint">
                    {t.visits === 1 ? "1 visit" : `${t.visits} visits`} · first seen {format(parseISO(t.firstSeen), "d MMM")}
                  </span>
                </span>
              </div>
            ))}
          </div>
          {tally.length === 0 && <p className="row-hint">Visitors come with the seasons. The first ones will be noted here.</p>}
          <ol className="wl-timeline">
            {notes.map((n, i) => (
              <li key={`${n.date}-${i}`}>
                <span className="wl-timeline-date">{format(parseISO(n.date), "d MMM yyyy")}</span>
                <span>{n.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </motion.div>
    </motion.div>
  );
}
