import type { Meal } from "./api";

// Other apps hand Tend a food through a link, so nothing is logged without the
// person seeing it first: the link only opens the food sheet, filled in.
//
//   tend://food/add?v=1&name=Pasta%20bake&portions=2&kcal=1660&protein=100&carbs=164&fat=66
//                  &meal=dinner&at=1763300000000&source=simmer&ref=cheesy-frankfurter-pasta

/** A meal sent from another app, waiting to be confirmed. */
export interface IncomingFood {
  name: string;
  /** Portions eaten; the numbers below are for all of them. */
  portions: number;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fibre: number | null;
  meal: Meal;
  at: number;
  /** Which app sent it: "simmer" for now. */
  source: "simmer";
  ref: string;
}

const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];
/** Links from far in the past or future are clamped to now rather than filed on an odd day. */
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function amount(value: string | null, max: number): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 10) / 10 : null;
}

export function parseFoodLink(raw: string, now = Date.now()): IncomingFood | null {
  // Parsed by hand: older Android WebViews read tend://food/add as host "" and path "//food/add",
  // newer ones as host "food" and path "/add", so new URL() can't be trusted with a custom scheme.
  const match = /^tend:\/\/([^/?#]*)(\/[^?#]*)?(?:\?([^#]*))?/i.exec(raw.trim());
  if (!match || match[1].toLowerCase() !== "food" || (match[2] ?? "").replace(/\/+$/, "") !== "/add") return null;
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(match[3] ?? "");
  } catch {
    return null;
  }
  if (q.get("v") && q.get("v") !== "1") return null;
  const name = (q.get("name") ?? "").trim().slice(0, 120);
  if (!name) return null;
  const at = Number(q.get("at"));
  const meal = q.get("meal") as Meal;
  return {
    name,
    portions: amount(q.get("portions"), 50) || 1,
    kcal: amount(q.get("kcal"), 20000),
    protein: amount(q.get("protein"), 2000),
    carbs: amount(q.get("carbs"), 2000),
    fat: amount(q.get("fat"), 2000),
    fibre: amount(q.get("fibre"), 2000),
    meal: MEALS.includes(meal) ? meal : "",
    at: Number.isFinite(at) && Math.abs(at - now) < WINDOW_MS ? at : now,
    source: "simmer",
    ref: (q.get("ref") ?? "").slice(0, 120),
  };
}

/** Links already handled: the one that launched the app is reported again on every getCurrent(). */
const handled = new Set<string>();

/** Listen for food links: the one that opened the app, and any that arrive while it runs. */
export async function listenForFoodLinks(onNewFood: (food: IncomingFood) => void): Promise<() => void> {
  const onFood = (food: IncomingFood, raw: string) => {
    if (handled.has(raw)) return;
    handled.add(raw);
    onNewFood(food);
  };
  // The browser preview (mock backend) takes a link as ?link=tend://food/add?...
  const preview = new URLSearchParams(location.search).get("link");
  if (preview) {
    const food = parseFoodLink(preview);
    if (food) onFood(food, preview);
    return () => {};
  }
  try {
    const { getCurrent, onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
    const handle = (urls: string[] | null) => {
      for (const u of urls ?? []) {
        const food = parseFoodLink(u);
        if (food) onFood(food, u);
      }
    };
    handle(await getCurrent());
    return await onOpenUrl(handle);
  } catch {
    // Not running inside the app: no links to hear.
    return () => {};
  }
}
