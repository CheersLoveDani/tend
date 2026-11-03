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
  const entries: any[] = [
    { id: "e1", kind: "mood", name: "Mood", value: 4, value2: null, unit: "", note: "", at: Date.now() - 3_600_000 },
    { id: "e2", kind: "measurement", name: "Blood pressure", value: 122, value2: 79, unit: "mmHg", note: "", at: Date.now() - 86_400_000 },
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
        };
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
        const e = { ...args.entry, id: args.entry.id || Math.random().toString(36).slice(2) };
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
      case "model_status":
        return { present: false, size: 105_000_000 };
      case "sync_info":
        return { deviceId: "web", name: "Preview", hosting: true, code: "482913", port: 47821, addresses: ["192.168.1.20"], peers: [] };
      case "sync_now":
        return { peers: 0, ok: 0, changed: 0, errors: [] };
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
      default:
        return null;
    }
  });
}
