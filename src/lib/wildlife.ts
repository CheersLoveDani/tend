// Garden wildlife: the comings and goings of nature around your tree.
//
// A wren moves in (the first time you finish something) and lives there for good. Visitors come
// and go with the real seasons, blue tits nest in spring, and sometimes a fledgling stays on. It
// never depends on what you did: nothing leaves because you were away, and nobody is ever sad.
//
// Everything is worked out from the date (a fixed pseudo-random schedule per year), so every
// device shows the same garden and nothing needs saving except when the wren moved in, its name,
// and which visitors you asked to stay.
import type { Species } from "../components/Critters";

export type Place = "branch" | "ground" | "air";

export interface WildlifeOptions {
  /** When the wren moved in (epoch ms). */
  since: number;
  /** Visitor species the person asked to stay. */
  kept: string[];
  /** Tree level: nests need a tree with branches. */
  level: number;
  /** Southern hemisphere: the seasons are turned around. */
  south: boolean;
}

export interface Creature {
  key: string;
  species: Species;
  role: "resident" | "visitor" | "kept" | "fledgling";
  places: Place[];
  /** Owls are only out in the evening. */
  evening?: boolean;
}

export interface NestState {
  phase: "building" | "eggs" | "chicks";
  eggs: number;
  chicks: number;
}

export interface Visit {
  species: Species;
  start: Date;
  end: Date;
}

const DAY = 86_400_000;

// ---- deterministic randomness -------------------------------------------------------------------

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
/** 0..1, fixed for a given key. */
const chance = (key: string) => hash(key) / 4294967296;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Southern hemisphere, guessed from the time zone. */
export function guessSouth(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    return /^(Australia|Antarctica)\//.test(tz) ||
      /^Pacific\/(Auckland|Chatham|Fiji|Tongatapu|Apia|Noumea|Efate)/.test(tz) ||
      /^America\/(Santiago|Argentina|Buenos_Aires|Montevideo|Asuncion|Sao_Paulo|La_Paz|Lima)/.test(tz) ||
      /^Africa\/(Johannesburg|Maputo|Harare|Lusaka|Windhoek|Gaborone|Maseru|Mbabane|Blantyre|Lubumbashi)/.test(tz) ||
      /^Indian\/(Mauritius|Reunion|Antananarivo)/.test(tz);
  } catch {
    return false;
  }
}

// ---- who visits, and when ----------------------------------------------------------------------

interface Schedule {
  species: Species;
  /** Months (1–12, northern hemisphere) the season runs; `to` before `from` wraps the new year. */
  from: number;
  to: number;
  visits: number;
  minDays: number;
  maxDays: number;
  places: Place[];
  evening?: boolean;
  /** Said softly when they've gone. */
  gone: string;
}

export const SCHEDULES: Schedule[] = [
  { species: "swallow", from: 4, to: 9, visits: 3, minDays: 7, maxDays: 16, places: ["air", "branch"], gone: "The swallows have headed off. They'll be back {when}." },
  { species: "butterfly", from: 5, to: 8, visits: 3, minDays: 3, maxDays: 8, places: ["air"], gone: "The butterfly has fluttered on. More come with the warm days." },
  { species: "hedgehog", from: 4, to: 10, visits: 2, minDays: 6, maxDays: 14, places: ["ground"], gone: "The hedgehog has pottered off. It does its rounds and comes back." },
  { species: "squirrel", from: 9, to: 11, visits: 2, minDays: 5, maxDays: 12, places: ["ground", "branch"], gone: "The squirrel has gone to bury its finds. It'll be back {when}." },
  { species: "robin", from: 10, to: 2, visits: 2, minDays: 8, maxDays: 20, places: ["branch", "ground"], gone: "The robin has moved on for now. Robins like a visit in the cold months." },
  { species: "owl", from: 1, to: 12, visits: 3, minDays: 4, maxDays: 10, places: ["branch"], evening: true, gone: "The owl has found another roost for a while." },
];

const scheduleOf = (s: Species) => SCHEDULES.find((x) => x.species === s);

/** Season window for [year] (start, length in days), turned around six months in the south. */
function season(s: Schedule, year: number, south: boolean): { start: Date; days: number } {
  const shift = south ? 6 : 0;
  const start = new Date(year, s.from - 1 + shift, 1);
  const endMonth = s.to < s.from ? s.to + 12 : s.to;
  const end = new Date(year, endMonth + shift, 1); // first day after the season
  return { start, days: Math.round((end.getTime() - start.getTime()) / DAY) };
}

/** A species' visits in the season that starts in [year]. */
function visitsIn(s: Schedule, year: number, south: boolean): Visit[] {
  const { start, days } = season(s, year, south);
  const slot = Math.floor(days / s.visits);
  const out: Visit[] = [];
  for (let k = 0; k < s.visits; k++) {
    const key = `${s.species}:${year}:${k}`;
    const len = s.minDays + Math.floor(chance(key + ":len") * (s.maxDays - s.minDays + 1));
    const room = Math.max(0, slot - len);
    const begin = addDays(start, k * slot + Math.floor(chance(key + ":at") * (room + 1)));
    out.push({ species: s.species, start: begin, end: addDays(begin, len) });
  }
  return out;
}

/** Every visit overlapping [from, to], all species. */
export function visitsBetween(from: Date, to: Date, south: boolean): Visit[] {
  const out: Visit[] = [];
  for (let y = from.getFullYear() - 1; y <= to.getFullYear(); y++) {
    for (const s of SCHEDULES) for (const v of visitsIn(s, y, south)) if (v.end > from && v.start <= to) out.push(v);
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

// ---- nesting -----------------------------------------------------------------------------------

export interface Nesting {
  year: number;
  start: Date; // building starts
  eggsAt: Date;
  hatchAt: Date;
  fledgeAt: Date;
  eggs: number;
  /** One of the chicks stays on after fledging. */
  stays: boolean;
}

/** Blue tits nest once a spring, in April (October in the south). */
export function nestingIn(year: number, south: boolean): Nesting {
  const start = new Date(year, (south ? 9 : 3), 1 + Math.floor(chance(`nest:${year}`) * 20));
  const eggsAt = addDays(start, 6);
  const hatchAt = addDays(eggsAt, 14);
  const fledgeAt = addDays(hatchAt, 18);
  return { year, start, eggsAt, hatchAt, fledgeAt, eggs: 3 + Math.floor(chance(`eggs:${year}`) * 2), stays: chance(`stay:${year}`) < 0.45 };
}

// ---- the garden on a day -------------------------------------------------------------------------

export interface GardenDay {
  creatures: Creature[];
  nest: NestState | null;
  /** Arrived within the last couple of days (for a soft "who's here" note). */
  arrived: Species[];
  /** Left within the last few days, with what's said about it. */
  left: { species: Species; text: string }[];
}

const SEASON_WORD = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"];
/** "spring", "next autumn"… for when a visitor's season comes round again. */
function nextSeasonWord(s: Schedule): string {
  // Schedules are written in northern months; the season they start in is the same word either way.
  return `in the ${SEASON_WORD[s.from - 1]}`;
}

export function gardenOn(when: Date, o: WildlifeOptions): GardenDay {
  const day = startOfDay(when);
  const since = startOfDay(new Date(o.since));
  const creatures: Creature[] = [{ key: "wren", species: "wren", role: "resident", places: ["branch", "ground"] }];

  // Fledglings that stayed on in earlier springs (since the wren moved in), up to two.
  if (o.level >= 4) {
    let stayed = 0;
    for (let y = since.getFullYear(); y <= day.getFullYear() && stayed < 2; y++) {
      const n = nestingIn(y, o.south);
      if (n.stays && n.start >= since && n.fledgeAt <= day) {
        creatures.push({ key: `fledgling-${y}`, species: "bluetit", role: "fledgling", places: ["branch"] });
        stayed++;
      }
    }
  }

  // Visitors in season (only ones that arrived after the wren did), and any asked to stay.
  const present = visitsBetween(day, day, o.south).filter((v) => v.start <= day && v.end > day && v.start >= since);
  const species = new Set<Species>(present.map((v) => v.species));
  for (const k of o.kept) if (scheduleOf(k as Species)) species.add(k as Species);
  for (const s of species) {
    const sch = scheduleOf(s)!;
    creatures.push({ key: s, species: s, role: o.kept.includes(s) ? "kept" : "visitor", places: sch.places, evening: sch.evening });
  }

  // This spring's nest.
  let nest: NestState | null = null;
  if (o.level >= 4) {
    const n = nestingIn(day.getFullYear(), o.south);
    if (n.start >= since && day >= n.start && day < n.fledgeAt) {
      const phase = day < n.eggsAt ? "building" : day < n.hatchAt ? "eggs" : "chicks";
      nest = { phase, eggs: phase === "eggs" ? n.eggs : 0, chicks: phase === "chicks" ? n.eggs : 0 };
      creatures.push({ key: "nesting-pair", species: "bluetit", role: "visitor", places: ["branch", "air"] });
    }
  }

  const arrived = present.filter((v) => (day.getTime() - v.start.getTime()) / DAY < 2).map((v) => v.species);
  const recent = visitsBetween(addDays(day, -4), day, o.south).filter((v) => v.end <= day && v.end > addDays(day, -4) && v.start >= since);
  const left = recent
    .filter((v) => !species.has(v.species))
    .map((v) => {
      const sch = scheduleOf(v.species)!;
      return { species: v.species, text: sch.gone.replace("{when}", nextSeasonWord(sch)) };
    });
  return { creatures, nest, arrived: [...new Set(arrived)], left: dedupe(left) };
}

function dedupe<T extends { species: Species }>(xs: T[]): T[] {
  const seen = new Set<Species>();
  return xs.filter((x) => !seen.has(x.species) && (seen.add(x.species), true));
}

// ---- field notes -------------------------------------------------------------------------------

export interface FieldNote {
  date: string;
  species: Species;
  text: string;
}

export interface FieldTally {
  species: Species;
  visits: number;
  firstSeen: string;
}

/** Everything that's happened in the garden since the wren moved in, newest first. */
export function fieldNotes(today: Date, o: WildlifeOptions, wrenName: string): { notes: FieldNote[]; tally: FieldTally[] } {
  const day = startOfDay(today);
  const since = startOfDay(new Date(o.since));
  const notes: FieldNote[] = [{ date: ymd(since), species: "wren", text: `${wrenName} the wren moved into your tree.` }];
  const tally = new Map<Species, FieldTally>();
  for (const v of visitsBetween(since, day, o.south)) {
    if (v.start < since || v.start > day) continue;
    const t = tally.get(v.species);
    if (t) t.visits++;
    else tally.set(v.species, { species: v.species, visits: 1, firstSeen: ymd(v.start) });
    notes.push({ date: ymd(v.start), species: v.species, text: arrivalText(v.species, !t) });
  }
  if (o.level >= 4) {
    for (let y = since.getFullYear(); y <= day.getFullYear(); y++) {
      const n = nestingIn(y, o.south);
      if (n.start < since || n.start > day) continue;
      notes.push({ date: ymd(n.start), species: "bluetit", text: "A pair of blue tits started building a nest." });
      if (n.eggsAt <= day) notes.push({ date: ymd(n.eggsAt), species: "bluetit", text: `${n.eggs} tiny eggs in the nest.` });
      if (n.hatchAt <= day) notes.push({ date: ymd(n.hatchAt), species: "chick", text: `The eggs hatched: ${n.eggs} chicks, beaks wide open.` });
      if (n.fledgeAt <= day)
        notes.push({
          date: ymd(n.fledgeAt),
          species: "chick",
          text: n.stays ? "The chicks fledged, and one of them decided to stay." : "The chicks fledged and flew off into the garden.",
        });
    }
  }
  notes.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { notes, tally: [...tally.values()].sort((a, b) => b.visits - a.visits) };
}

function arrivalText(s: Species, first: boolean): string {
  const lines: Partial<Record<Species, [string, string]>> = {
    swallow: ["First swallows of the year, swooping round the tree.", "The swallows are back."],
    butterfly: ["A butterfly found the garden.", "A butterfly drifted by."],
    hedgehog: ["A hedgehog came snuffling under the tree.", "The hedgehog is doing its rounds again."],
    squirrel: ["A squirrel arrived, very busy with something.", "The squirrel is back, burying things."],
    robin: ["A robin started visiting.", "The robin is back for the cold months."],
    owl: ["A tawny owl roosted in your tree.", "The owl is roosting in your tree again."],
  };
  const l = lines[s];
  return l ? l[first ? 0 : 1] : "Someone new came by.";
}

/** Pretty name for a creature (the wren goes by the name it was given). */
export function creatureName(c: Pick<Creature, "species" | "role">, wrenName: string, info: Record<Species, { name: string }>): string {
  if (c.species === "wren") return wrenName;
  if (c.role === "fledgling") return "a young blue tit";
  return `the ${info[c.species].name}`;
}
