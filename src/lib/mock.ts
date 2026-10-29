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
  let settings: Record<string, unknown> = { onboarded: true };
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
        };
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
      default:
        return null;
    }
  });
}
