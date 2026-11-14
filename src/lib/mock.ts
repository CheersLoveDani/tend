// Browser-only stand-in for the Rust backend, used when previewing the UI with `npm run dev`
// outside Tauri. It mirrors the reward rules closely enough to exercise every animation.
import { mockIPC } from "@tauri-apps/api/mocks";
import type { LevelInfo, Reminder, ReminderInput } from "./api";
import { bitValue, stepValue } from "./rewards";
import { plusDays, today } from "./dates";

const STAGES = ["Seed", "Sprout", "Seedling", "Sapling", "Young tree", "Leafy tree", "Blossoming tree", "Fruit tree", "Old oak", "Grove"];

function level(xp: number): LevelInfo {
  let l = 1;
  let rest = xp;
  const size = (n: number) => 60 + 25 * (n - 1);
  while (rest >= size(l)) rest -= size(l++);
  return { level: l, xp, intoLevel: rest, levelSize: size(l), stage: STAGES[Math.min(9, Math.floor((l - 1) / 3))] };
}

export function installMock() {
  const ledger = new Map<string, number>();
  // ?welcome previews onboarding.
  let settings: Record<string, unknown> = { onboarded: !new URLSearchParams(location.search).has("welcome"), fitSince: today() };
  // Fake Health Connect: ?steps=9500&mins=25 previews the goal bars at any value.
  (window as unknown as Record<string, unknown>).__TEND_MOCK_FIT__ = true;
  const q = new URLSearchParams(location.search);
  const mockSteps = Number(q.get("steps") ?? 7340);
  const mockMins = Number(q.get("mins") ?? 25);
  const mk = (title: string, date: string, reward: number, steps: string[] = [], time: string | null = null): Reminder => ({
    id: Math.random().toString(36).slice(2),
    seriesId: "",
    title,
    notes: "",
    date,
    time,
    steps: steps.map((s, i) => ({ id: `s${i}`, title: s, done: false })),
    reward,
    suggested: reward,
    status: "open",
    repeat: null,
    bits: 0,
    completedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    device: "web",
    deleted: false,
  });
  const reminders: Reminder[] = [
    mk("Reply to Sam's email", plusDays(-1), 10),
    mk("Clean the kitchen", today(), 30, ["Clear the counters", "Load the dishwasher", "Wipe the hob", "Take the bin out"]),
    mk("Take vitamins", today(), 5, [], "09:00"),
    mk("Book dentist appointment", today(), 15, [], "14:30"),
    mk("Do the tax return", plusDays(3), 50, ["Find last year's login", "Gather P60", "Fill in income", "Submit"]),
    mk("Water the plants", plusDays(1), 5, [], "18:00"),
  ];
  // 0.3 preview: an older overdue item, a Someday one, and ?cal / ?buttons / ?quiet switches.
  reminders.push(mk("Return the library book", plusDays(-4), 10), mk("Learn to juggle", "9999-12-31", 20));
  if (q.has("cal")) {
    Object.assign(window, { __TEND_MOCK_CAL__: true });
    settings.calendarEnabled = true;
  }
  if (q.has("buttons")) settings.unlockButtons = true;
  if (q.has("quiet")) settings.pausedUntil = new Date().setHours(23, 59, 59, 999);
  ledger.set("seed", Number(new URLSearchParams(location.search).get("xp") ?? 130));
  const xp = () => [...ledger.values()].reduce((a, b) => a + b, 0);
  const find = (id: string) => reminders.find((r) => r.id === id)!;
  const paid = (r: Reminder) =>
    [...ledger.entries()].filter(([k]) => k.startsWith(r.id) && (k.includes(":step:") || k.includes(":bit:"))).reduce((a, [, v]) => a + v, 0);
  const event = (kind: string, gained: number, bonus: number, before: number, r: Reminder) => ({
    kind,
    gained,
    bonus,
    remaining: r.status === "done" ? 0 : Math.max(r.reward - paid(r), Math.ceil(r.reward * 0.25)),
    before: level(before),
    after: level(xp()),
    reminder: { ...r, steps: r.steps.map((s) => ({ ...s })) },
  });
  const finish = (r: Reminder) => {
    const g = Math.max(r.reward - paid(r), Math.ceil(r.reward * 0.25));
    ledger.set(`${r.id}:finish`, g);
    const bonus = Math.random() < 0.3 ? 4 : 0;
    if (bonus) ledger.set(`${r.id}:bonus`, bonus);
    r.status = "done";
    r.completedAt = Date.now();
    r.steps.forEach((s) => (s.done = true));
    return [g, bonus];
  };

  // Medicine: two sample meds whose doses are worked out the simple way (every day).
  const meds: any[] = [
    { id: "m1", name: "Vitamin D3", strength: "1000 IU", form: "tablet", icon: "round", color: "sun", notes: "", schedule: { kind: "daily", every: 1, days: [], onDays: 0, offDays: 0, times: [{ time: "08:00", amount: 1 }] }, startDate: plusDays(-60), endDate: null, stock: 78, stockAt: 0, refillAt: 10, paused: false, critical: false, reward: 5, createdAt: 0 },
    { id: "m2", name: "Sertraline", strength: "50 mg", form: "capsule", icon: "capsule", color: "sky", notes: "With breakfast", schedule: { kind: "daily", every: 1, days: [], onDays: 0, offDays: 0, times: [{ time: "08:05", amount: 1 }, { time: "21:00", amount: 1 }] }, startDate: plusDays(-30), endDate: null, stock: 4, stockAt: 0, refillAt: 7, paused: false, critical: true, reward: 5, createdAt: 0 },
  ];
  const logged = new Map<string, { status: string; at: number }>();
  // ?food: the food log switched on, with a little history.
  if (q.has("food")) settings = { ...settings, foodTracking: true, seenFeatures: ["food"] };
  const H = 3_600_000;
  const foods: any[] = q.has("food")
    ? [
        { id: "f1", name: "Porridge", emoji: "🥣", meal: "breakfast", kcal: 220, amount: "a bowl", grams: 250, source: "estimate", barcode: "", note: "", at: Date.now() - 5 * H },
        { id: "f2", name: "Coffee with milk", emoji: "☕", meal: "breakfast", kcal: 35, amount: "a mug", grams: 250, source: "estimate", barcode: "", note: "", at: Date.now() - 5 * H },
        { id: "f3", name: "Leftover curry", emoji: "🍛", meal: "lunch", kcal: null, amount: "", grams: null, source: "", barcode: "", note: "", at: Date.now() - 1 * H },
        { id: "f4", name: "Twix", emoji: "🍫", meal: "snack", kcal: 250, amount: "whole pack (50 g)", grams: 50, source: "barcode", barcode: "5000159484695", note: "", at: Date.now() - 26 * H },
        { id: "f5", name: "Pasta with sauce", emoji: "🍝", meal: "dinner", kcal: 550, amount: "a bowl", grams: 350, source: "estimate", barcode: "", note: "", at: Date.now() - 30 * H },
      ]
    : [];
  const twix = { name: "Twix", brand: "Twix", barcode: "5000159484695", kcal100: 495, kcalServing: 248, servingG: 50, servingText: "1 pack (50 g)", packG: 50, unit: "g" };
  const foodLib: any[] = q.has("food")
    ? [
        { id: "n:porridge", name: "Porridge", emoji: "🥣", info: null, lastKcal: 220, lastAmount: "a bowl", lastGrams: 250, uses: 4, lastUsed: Date.now() - 5 * H },
        { id: "5000159484695", name: "Twix", emoji: "🍫", info: twix, lastKcal: 250, lastAmount: "whole pack (50 g)", lastGrams: 50, uses: 2, lastUsed: Date.now() - 26 * H },
      ]
    : [];
  const entries: any[] = [
    { id: "e1", kind: "mood", name: "Mood", value: 4, value2: null, unit: "", note: "", at: Date.now() - 3_600_000 },
    { id: "e2", kind: "measurement", name: "Blood pressure", value: 122, value2: 79, unit: "mmHg", note: "", at: Date.now() - 86_400_000 },
    // ?moods: three months of check-ins with reasons, for the weather map.
    ...(new URLSearchParams(location.search).has("moods") ? sampleMoods() : []),
  ];
  const doses = () =>
    meds
      .filter((m) => !m.deleted)
      .flatMap((m) =>
        m.schedule.times.map((t: any) => {
          const id = `${m.id}@${today()}T${t.time}`;
          const [h, mi] = t.time.split(":").map(Number);
          const due = new Date();
          due.setHours(h, mi, 0, 0);
          const l = logged.get(id);
          return { id, medId: m.id, name: `${m.name} ${m.strength}`, date: today(), time: t.time, amount: t.amount, form: m.form, status: l?.status ?? (due.getTime() <= Date.now() ? "due" : "upcoming"), dueAt: due.getTime(), loggedAt: l?.at ?? null, critical: m.critical, extra: false };
        }),
      )
      .sort((x, y) => x.time.localeCompare(y.time));
  const medView = (m: any) => {
    const used = [...logged.entries()].filter(([k, v]) => k.startsWith(m.id) && v.status === "taken").length;
    const left = m.stock == null ? null : Math.max(0, m.stock - used);
    return { ...m, left, daysLeft: left == null ? null : Math.floor(left / m.schedule.times.length), low: left != null && left <= (m.refillAt ?? 7) };
  };
  const doseEvent = (id: string, gained: number, before: number) => ({ kind: gained >= 0 ? "bit" : "undo", gained, bonus: 0, remaining: 0, before: level(before), after: level(xp()), reminder: { ...mk("Dose", today(), 0), id } });

  mockIPC((cmd, a) => {
    const args = a as Record<string, any>;
    const before = xp();
    switch (cmd) {
      case "snapshot":
        return {
          reminders: reminders.filter((r) => !r.deleted),
          level: level(xp()),
          days: Array.from({ length: 30 }, (_, i) => ({ date: plusDays(i - 29), seeds: i === 29 ? 20 : Math.random() < 0.3 ? 0 : Math.round(Math.random() * 60), done: 2 })),
          deviceId: "web",
          meds: meds.filter((m) => !m.deleted).map(medView),
          doses: doses(),
          doseAlarms: [],
          entries: entries.filter((e) => !e.deleted),
          foods: foods.filter((f) => !f.deleted).sort((a, b) => b.at - a.at),
          foodLib: foodLib.filter((f) => !f.deleted).sort((a, b) => b.lastUsed - a.lastUsed),
        };
      case "save_food": {
        const f = { ...args.food, id: args.food.id || Math.random().toString(36).slice(2), at: args.food.at || Date.now() };
        const at = foods.findIndex((x) => x.id === f.id);
        if (at >= 0) foods[at] = f;
        else foods.push(f);
        const libId = f.barcode || `n:${f.name.toLowerCase()}`;
        const saved = foodLib.find((x) => x.id === libId);
        const next = { id: libId, name: f.name, emoji: f.emoji, info: args.info ?? saved?.info ?? null, lastKcal: f.kcal, lastAmount: f.amount, lastGrams: f.grams, uses: (saved?.uses ?? 0) + 1, lastUsed: Date.now() };
        if (saved) Object.assign(saved, next);
        else foodLib.push(next);
        const paid = ledger.has(`${f.id}:log`);
        ledger.set(`${f.id}:log`, 2);
        return doseEvent(f.id, paid ? 0 : 2, before);
      }
      case "delete_food":
        foods.find((f) => f.id === args.id).deleted = true;
        ledger.delete(`${args.id}:log`);
        return null;
      case "forget_food":
        foodLib.find((f) => f.id === args.id).deleted = true;
        return null;
      case "food_barcode":
        return new Promise((ok) => setTimeout(() => ok(args.code === "5000159484695" ? twix : null), 500));
      case "food_search":
        return new Promise((ok) =>
          setTimeout(() => ok([{ name: `${args.query} (sample)`, brand: "Brand", barcode: "123456789", kcal100: 180, kcalServing: 90, servingG: 50, servingText: "1 pot (50 g)", packG: 200, unit: "g" }]), 600),
        );
      case "food_parse_label":
        return { kcal100: 250, kcalServing: 75, servingG: 30, servingText: "per 30g portion", unit: "g", seen: [250, 75] };
      case "save_med": {
        const i = args.input;
        const existing = meds.find((m) => m.id === i.id);
        if (existing) Object.assign(existing, i);
        else meds.push({ ...i, id: Math.random().toString(36).slice(2), stockAt: 0, createdAt: Date.now() });
        return i;
      }
      case "delete_med":
        meds.find((m) => m.id === args.id).deleted = true;
        return null;
      case "add_med_stock": {
        const m = meds.find((x) => x.id === args.id);
        m.stock = (m.stock ?? 0) + args.amount;
        return m;
      }
      case "take_dose":
      case "take_extra_dose": {
        const id = args.id ?? `${args.medId}@${today()}T${Date.now()}`;
        logged.set(id, { status: "taken", at: Date.now() });
        ledger.set(`${id}:dose`, 7);
        return doseEvent(id, 7, before);
      }
      case "skip_dose":
        logged.set(args.id, { status: "skipped", at: Date.now() });
        ledger.delete(`${args.id}:dose`);
        ledger.set(`${args.id}:skip`, 2);
        return doseEvent(args.id, xp() - before, before);
      case "undo_dose":
        logged.delete(args.id);
        ledger.delete(`${args.id}:dose`);
        ledger.delete(`${args.id}:skip`);
        return doseEvent(args.id, xp() - before, before);
      case "med_history":
        return Array.from({ length: args.days }, (_, i) => ({ date: plusDays(i - args.days + 1), scheduled: 2, taken: i === args.days - 1 ? 0 : Math.random() < 0.85 ? 2 : 1, skipped: 0 }));
      case "save_entry": {
        const seen = new Set<string>();
        const reasons = (args.entry.reasons ?? [])
          .map((r: { label: string; emoji: string }) => ({ label: String(r.label ?? "").trim().replace(/\s+/g, " "), emoji: String(r.emoji ?? "").trim() }))
          .filter((r: { label: string }) => r.label && !seen.has(r.label.toLowerCase()) && seen.add(r.label.toLowerCase()))
          .slice(0, 12);
        const e = { ...args.entry, id: args.entry.id || Math.random().toString(36).slice(2), reasons: reasons.length ? reasons : undefined };
        const at = entries.findIndex((x) => x.id === e.id);
        if (at >= 0) entries[at] = e;
        else entries.unshift(e);
        ledger.set(`${e.id}:log`, 2);
        return doseEvent(e.id, 2, before);
      }
      case "delete_entry":
        entries.find((e) => e.id === args.id).deleted = true;
        return null;
      case "export_health":
        return JSON.stringify({ app: "tend", version: 1, meds, doses: [], entries }, null, 2);
      case "import_health":
        return [0, 0, 0];
      case "get_settings":
        return settings;
      case "set_settings":
        settings = args.settings;
        return null;
      case "save_reminder": {
        const i = args.input as ReminderInput;
        const existing = i.id ? find(i.id) : null;
        const r = existing ?? mk(i.title, i.date, i.reward);
        Object.assign(r, i, { id: r.id, deleted: false });
        if (!existing) reminders.push(r);
        return r;
      }
      case "delete_reminder":
        find(args.id).deleted = true;
        return null;
      case "move_reminder":
        find(args.id).date = args.date;
        return find(args.id);
      case "move_reminders": {
        const moving = reminders.filter((r) => args.ids.includes(r.id) && r.date !== args.date);
        moving.forEach((r) => (r.date = args.date));
        return moving.length;
      }
      case "toggle_step": {
        const r = find(args.id);
        const s = r.steps.find((x) => x.id === args.stepId)!;
        s.done = args.done;
        if (args.done) {
          ledger.set(`${r.id}:step:${s.id}`, stepValue(r));
          if (r.steps.every((x) => x.done)) {
            const [g, b] = finish(r);
            return event("finish", g + stepValue(r), b, before, r);
          }
          return event("step", stepValue(r), 0, before, r);
        }
        ledger.delete(`${r.id}:step:${s.id}`);
        ledger.delete(`${r.id}:finish`);
        r.status = "open";
        return event("undo", -stepValue(r), 0, before, r);
      }
      case "did_a_bit": {
        const r = find(args.id);
        r.bits += 1;
        ledger.set(`${r.id}:bit:${r.bits}`, bitValue(r));
        return event("bit", bitValue(r), 0, before, r);
      }
      case "complete_reminder": {
        const r = find(args.id);
        const [g, b] = finish(r);
        return event("finish", g, b, before, r);
      }
      case "reopen_reminder": {
        const r = find(args.id);
        ledger.delete(`${r.id}:finish`);
        ledger.delete(`${r.id}:bonus`);
        r.status = "open";
        return event("undo", xp() - before, 0, before, r);
      }
      case "suggest_reward": {
        const t = String(args.title).toLowerCase();
        const big = /tax|clean|deep|report|move|essay/.test(t);
        return new Promise((res) =>
          setTimeout(() => res({ reward: big ? 40 : 15, effort: big ? 8 : 3, source: "heuristic", millis: 3, reason: big ? "Looks like a big one — worth a lot" : "A medium-sized task" }), 400),
        );
      }
      case "suggest_steps":
        return [
          { steps: ["Put clothes in the basket", "Clear the sink", "Wipe the surfaces", "Mop the floor"], from: "Clean the bathroom", source: "library", similarity: 0.8 },
        ];
      case "suggest_emoji": {
        const t = String(args.text).toLowerCase();
        const map: [RegExp, string][] = [
          [/sleep|tired|slept|exhaust|nap|insomnia/, "😴"],
          [/work|job|boss|office|meeting|deadline/, "💼"],
          [/exam|test|essay|assignment/, "📝"],
          [/school|study|class|homework|uni/, "📚"],
          [/money|bill|rent|debt|pay/, "💸"],
          [/friend/, "👯"],
          [/family|mum|mom|dad|parent|sister|brother/, "👨‍👩‍👧"],
          [/partner|love|boyfriend|girlfriend|husband|wife|date/, "❤️"],
          [/dog|puppy/, "🐶"],
          [/cat|kitten/, "🐱"],
          [/gym|exercise|workout/, "🏋️"],
          [/walk/, "🚶"],
          [/run|jog/, "🏃"],
          [/sun|warm/, "☀️"],
          [/rain|wet/, "🌧️"],
          [/nature|outside|park|tree/, "🌳"],
          [/coffee|caffeine/, "☕"],
          [/food|eat|meal|lunch|dinner/, "🍽️"],
          [/alcohol|wine|beer|drink/, "🍷"],
          [/sick|ill|flu|cold/, "🤒"],
          [/pain|hurt|ache/, "🤕"],
          [/period|cramp/, "🩸"],
          [/med|pill|tablet/, "💊"],
          [/therap/, "🛋️"],
          [/anx|worr|panic|nervous/, "😰"],
          [/stress|overwhelm|busy/, "😵‍💫"],
          [/lonely|alone/, "🫂"],
          [/music|song/, "🎵"],
          [/game/, "🎮"],
          [/book|read/, "📖"],
          [/tv|film|movie|netflix/, "🎬"],
          [/art|draw|paint/, "🎨"],
          [/clean|tidy|chore|laundry/, "🧹"],
          [/shop/, "🛍️"],
          [/travel|holiday|trip|flight/, "✈️"],
          [/commute|bus|train|traffic/, "🚌"],
          [/weekend|party/, "🎉"],
          [/news/, "📰"],
          [/phone|social media|scroll/, "📱"],
          [/meditat|yoga/, "🧘"],
          [/birthday/, "🎂"],
          [/garden|plant/, "🌱"],
        ];
        const hit = map.find(([re]) => re.test(t));
        return new Promise((res) => setTimeout(() => res(hit ? hit[1] : "💭"), 150));
      }
      case "model_status":
        return { present: false, size: 105_000_000 };
      case "sync_info":
        return { deviceId: "web", name: "Preview", hosting: true, code: "482913", port: 47821, addresses: ["192.168.1.20"], peers: [] };
      case "sync_now":
        return { peers: 0, ok: 0, changed: 0, errors: [] };
      case "set_live_sync":
        return null;
      case "discover_hosts":
        return [];
      case "plugin:tend-native|health_status":
      case "plugin:tend-native|health_request":
        return { status: "available", steps: true, workouts: true };
      case "plugin:tend-native|health_read": {
        const start = Date.now() - (mockMins + 60) * 60_000;
        return {
          days: [{ date: today(), steps: mockSteps }],
          workouts: mockMins ? [{ id: "w1", start, end: start + mockMins * 60_000, type: 56, title: "", app: "preview" }] : [],
        };
      }
      case "fit_award":
        return { event: { kind: "none", gained: 0, bonus: 0, remaining: 0, before: level(before), after: level(before), reminder: mk("Moving", today(), 0) }, earned: [], counted: args.input.workouts.map((w: { id: string }) => w.id), completed: [] };
      case "move_reminders":
        for (const id of args.ids) find(id).date = args.date;
        return args.ids.length;
      case "plugin:tend-native|calendar_events": {
        const at = (d: number, h: number, m = 0) => new Date(new Date().setHours(0, 0, 0, 0) + d * 86_400_000).setHours(h, m);
        const ev = (id: string, title: string, start: number, end: number, allDay = false, location = "") => ({ id, calendarId: "c1", title, start, end, allDay, color: allDay ? "#8e7cc3" : "#3f8f6b", location });
        return {
          events: [
            ev("e1", "Bin day", at(0, 0), at(1, 0), true),
            ev("e2", "Stand-up", at(0, 9, 30), at(0, 9, 45), false, "Video call"),
            ev("e3", "Lunch with Alex", at(0, 12, 30), at(0, 13, 30), false, "The Green Café"),
            ev("e4", "Physio", at(2, 16), at(2, 17), false, "Riverside Clinic"),
            ev("e5", "Mum's birthday", at(5, 0), at(6, 0), true),
          ].filter((e) => e.end > args.from && e.start < args.to),
        };
      }
      default:
        return null;
    }
  });
}

/** Deterministic sample check-ins over ~100 days (most days, some gaps), with reasons. */
function sampleMoods() {
  const R = {
    sleep: { label: "Sleep", emoji: "😴" },
    work: { label: "Work", emoji: "💼" },
    friends: { label: "Friends", emoji: "👯" },
    exercise: { label: "Exercise", emoji: "🏃" },
    walk: { label: "Walked the dog", emoji: "🐶" },
    money: { label: "Money", emoji: "💸" },
    rest: { label: "Rest", emoji: "🛋️" },
  };
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const out: any[] = [];
  for (let d = 100; d >= 1; d--) {
    if (rnd() < 0.18) continue;
    const at = new Date();
    at.setDate(at.getDate() - d);
    at.setHours(20, Math.floor(rnd() * 59), 0, 0);
    const weekend = at.getDay() === 0 || at.getDay() === 6;
    const reasons: { label: string; emoji: string }[] = [];
    let v = 3 + (weekend ? 1 : 0) + (rnd() < 0.5 ? 0 : rnd() < 0.5 ? 1 : -1);
    if (rnd() < 0.3) (reasons.push(R.sleep), (v -= 1));
    if (!weekend && rnd() < 0.4) (reasons.push(R.work), (v -= rnd() < 0.6 ? 1 : 0));
    if (rnd() < 0.3) (reasons.push(R.walk), (v += 1));
    if (weekend && rnd() < 0.5) reasons.push(R.friends);
    if (rnd() < 0.2) (reasons.push(R.exercise), (v += 1));
    if (rnd() < 0.1) (reasons.push(R.money), (v -= 1));
    if (rnd() < 0.15) reasons.push(R.rest);
    out.push({ id: `m${d}`, kind: "mood", name: "Mood", value: Math.max(1, Math.min(5, v)), value2: null, unit: "", note: "", reasons, at: at.getTime() });
  }
  return out;
}
