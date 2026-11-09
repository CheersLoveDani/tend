// Food log helpers: rough calorie estimates for everyday foods (offline), meals, totals,
// and the two camera paths on Android: scanning a barcode and reading a nutrition label.
import { api, isAndroid, type Food, type FoodInfo, type LabelGuess, type Meal } from "./api";
import { invoke } from "@tauri-apps/api/core";

export const MEALS: { value: Exclude<Meal, "">; label: string; emoji: string }[] = [
  { value: "breakfast", label: "Breakfast", emoji: "🌅" },
  { value: "lunch", label: "Lunch", emoji: "☀️" },
  { value: "dinner", label: "Dinner", emoji: "🌙" },
  { value: "snack", label: "Snack", emoji: "🍪" },
];

/** A sensible meal for a time of day; easy to change. */
export function mealFor(ms: number): Exclude<Meal, ""> {
  const h = new Date(ms).getHours();
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 15) return "lunch";
  if (h >= 17 && h < 22) return "dinner";
  return "snack";
}

/** One everyday food: a typical portion and roughly what it comes to. */
export interface Common {
  name: string;
  emoji: string;
  portion: string;
  grams: number;
  kcal: number;
  /** Other words people use for it. */
  also?: string;
}

// Typical portions, rounded. These are estimates: brands, recipes and portions vary a lot.
// prettier-ignore
export const COMMON: Common[] = [
  // fruit
  { name: "Apple", emoji: "🍎", portion: "1 medium", grams: 180, kcal: 95 },
  { name: "Banana", emoji: "🍌", portion: "1 medium", grams: 120, kcal: 105 },
  { name: "Orange", emoji: "🍊", portion: "1 medium", grams: 130, kcal: 60, also: "satsuma clementine mandarin" },
  { name: "Pear", emoji: "🍐", portion: "1 medium", grams: 180, kcal: 100 },
  { name: "Grapes", emoji: "🍇", portion: "a handful", grams: 80, kcal: 55 },
  { name: "Strawberries", emoji: "🍓", portion: "a handful", grams: 80, kcal: 25, also: "berries raspberries blueberries" },
  { name: "Melon", emoji: "🍈", portion: "1 slice", grams: 150, kcal: 50, also: "watermelon" },
  { name: "Mango", emoji: "🥭", portion: "half", grams: 100, kcal: 60 },
  { name: "Pineapple", emoji: "🍍", portion: "1 slice", grams: 80, kcal: 40 },
  { name: "Kiwi", emoji: "🥝", portion: "1", grams: 70, kcal: 40 },
  { name: "Raisins", emoji: "🍇", portion: "a small box", grams: 30, kcal: 90, also: "dried fruit sultanas" },
  { name: "Avocado", emoji: "🥑", portion: "half", grams: 70, kcal: 115 },
  // veg
  { name: "Salad", emoji: "🥗", portion: "a side bowl", grams: 100, kcal: 20, also: "lettuce leaves greens" },
  { name: "Carrot", emoji: "🥕", portion: "1 medium", grams: 60, kcal: 25 },
  { name: "Broccoli", emoji: "🥦", portion: "a serving", grams: 80, kcal: 30, also: "vegetables veg greens" },
  { name: "Peas", emoji: "🫛", portion: "a serving", grams: 80, kcal: 65 },
  { name: "Sweetcorn", emoji: "🌽", portion: "a serving", grams: 80, kcal: 70, also: "corn" },
  { name: "Tomato", emoji: "🍅", portion: "1 medium", grams: 120, kcal: 20 },
  { name: "Baked potato", emoji: "🥔", portion: "1 medium", grams: 200, kcal: 185, also: "jacket potato" },
  { name: "Mashed potato", emoji: "🥔", portion: "a serving", grams: 180, kcal: 180, also: "mash" },
  { name: "Roast potatoes", emoji: "🥔", portion: "a serving", grams: 150, kcal: 225 },
  { name: "Chips", emoji: "🍟", portion: "a portion", grams: 150, kcal: 330, also: "fries french fries" },
  { name: "Baked beans", emoji: "🫘", portion: "half a tin", grams: 200, kcal: 160, also: "beans" },
  // bread, grains, breakfast
  { name: "Toast", emoji: "🍞", portion: "1 slice", grams: 35, kcal: 80, also: "bread slice" },
  { name: "Toast with butter", emoji: "🍞", portion: "1 slice", grams: 42, kcal: 130 },
  { name: "Bagel", emoji: "🥯", portion: "1", grams: 90, kcal: 250 },
  { name: "Croissant", emoji: "🥐", portion: "1", grams: 60, kcal: 240, also: "pastry" },
  { name: "Pain au chocolat", emoji: "🥐", portion: "1", grams: 60, kcal: 250 },
  { name: "Sandwich", emoji: "🥪", portion: "1", grams: 200, kcal: 400, also: "sarnie butty" },
  { name: "Wrap", emoji: "🌯", portion: "1", grams: 200, kcal: 450, also: "burrito" },
  { name: "Porridge", emoji: "🥣", portion: "a bowl", grams: 250, kcal: 220, also: "oatmeal oats" },
  { name: "Cereal with milk", emoji: "🥣", portion: "a bowl", grams: 155, kcal: 220, also: "cornflakes muesli granola" },
  { name: "Granola", emoji: "🥣", portion: "a bowl", grams: 50, kcal: 230 },
  { name: "Pancakes", emoji: "🥞", portion: "2", grams: 100, kcal: 230, also: "crepes" },
  { name: "Waffle", emoji: "🧇", portion: "1", grams: 75, kcal: 220 },
  { name: "Rice", emoji: "🍚", portion: "a serving, cooked", grams: 180, kcal: 230 },
  { name: "Fried rice", emoji: "🍚", portion: "a serving", grams: 250, kcal: 400 },
  { name: "Pasta", emoji: "🍝", portion: "a serving, cooked", grams: 220, kcal: 330, also: "spaghetti penne" },
  { name: "Pasta with sauce", emoji: "🍝", portion: "a bowl", grams: 350, kcal: 550, also: "bolognese spaghetti" },
  { name: "Noodles", emoji: "🍜", portion: "a bowl", grams: 300, kcal: 450, also: "ramen instant noodles pot noodle" },
  { name: "Couscous", emoji: "🍚", portion: "a serving", grams: 150, kcal: 170 },
  // eggs, dairy
  { name: "Egg", emoji: "🥚", portion: "1 large", grams: 60, kcal: 80, also: "boiled egg poached egg" },
  { name: "Fried egg", emoji: "🍳", portion: "1", grams: 60, kcal: 110 },
  { name: "Scrambled eggs", emoji: "🍳", portion: "2 eggs", grams: 140, kcal: 230 },
  { name: "Omelette", emoji: "🍳", portion: "2 eggs", grams: 150, kcal: 250 },
  { name: "Yogurt", emoji: "🥛", portion: "a pot", grams: 125, kcal: 120, also: "yoghurt" },
  { name: "Greek yogurt", emoji: "🥛", portion: "a bowl", grams: 150, kcal: 150 },
  { name: "Cheese", emoji: "🧀", portion: "a matchbox-size piece", grams: 30, kcal: 120, also: "cheddar" },
  { name: "Milk", emoji: "🥛", portion: "a glass", grams: 250, kcal: 120 },
  { name: "Butter", emoji: "🧈", portion: "a spread", grams: 7, kcal: 50 },
  // meat, fish, plant protein
  { name: "Chicken breast", emoji: "🍗", portion: "1", grams: 150, kcal: 250, also: "chicken" },
  { name: "Bacon", emoji: "🥓", portion: "2 rashers", grams: 50, kcal: 180 },
  { name: "Sausage", emoji: "🌭", portion: "1", grams: 50, kcal: 150, also: "sausages banger" },
  { name: "Burger", emoji: "🍔", portion: "1 in a bun", grams: 220, kcal: 550, also: "hamburger cheeseburger" },
  { name: "Steak", emoji: "🥩", portion: "1", grams: 200, kcal: 450 },
  { name: "Fish fillet", emoji: "🐟", portion: "1", grams: 140, kcal: 180, also: "salmon cod fish" },
  { name: "Fish and chips", emoji: "🐟", portion: "a portion", grams: 450, kcal: 900 },
  { name: "Fish fingers", emoji: "🐟", portion: "3", grams: 85, kcal: 190 },
  { name: "Tuna", emoji: "🐟", portion: "a small tin", grams: 100, kcal: 110 },
  { name: "Tofu", emoji: "🧊", portion: "a serving", grams: 100, kcal: 130 },
  { name: "Hummus", emoji: "🫘", portion: "2 tablespoons", grams: 50, kcal: 150, also: "houmous" },
  { name: "Nuts", emoji: "🥜", portion: "a handful", grams: 30, kcal: 180, also: "almonds cashews peanuts" },
  { name: "Peanut butter", emoji: "🥜", portion: "a tablespoon", grams: 16, kcal: 95 },
  // meals
  { name: "Pizza", emoji: "🍕", portion: "2 slices", grams: 200, kcal: 550 },
  { name: "Curry with rice", emoji: "🍛", portion: "a plate", grams: 450, kcal: 700, also: "curry" },
  { name: "Chilli", emoji: "🌶️", portion: "a bowl", grams: 300, kcal: 350, also: "chili con carne" },
  { name: "Stir fry", emoji: "🥘", portion: "a plate", grams: 350, kcal: 450 },
  { name: "Soup", emoji: "🍲", portion: "a bowl", grams: 300, kcal: 180 },
  { name: "Stew", emoji: "🍲", portion: "a bowl", grams: 350, kcal: 380, also: "casserole" },
  { name: "Roast dinner", emoji: "🍖", portion: "a plate", grams: 550, kcal: 750, also: "sunday roast" },
  { name: "Lasagne", emoji: "🍝", portion: "a portion", grams: 350, kcal: 550, also: "lasagna" },
  { name: "Mac and cheese", emoji: "🧀", portion: "a bowl", grams: 300, kcal: 550, also: "macaroni cheese" },
  { name: "Sushi", emoji: "🍣", portion: "6 pieces", grams: 180, kcal: 300 },
  { name: "Tacos", emoji: "🌮", portion: "2", grams: 200, kcal: 400 },
  { name: "Kebab", emoji: "🥙", portion: "1", grams: 350, kcal: 750, also: "doner gyro shawarma" },
  { name: "Pie", emoji: "🥧", portion: "1 individual", grams: 200, kcal: 550, also: "pasty sausage roll" },
  { name: "Quiche", emoji: "🥧", portion: "a slice", grams: 150, kcal: 400 },
  { name: "Meal deal", emoji: "🥪", portion: "sandwich, crisps, drink", grams: 450, kcal: 750 },
  // snacks and sweets
  { name: "Crisps", emoji: "🥔", portion: "a small bag", grams: 25, kcal: 130, also: "chips potato chips" },
  { name: "Popcorn", emoji: "🍿", portion: "a small bag", grams: 25, kcal: 120 },
  { name: "Chocolate bar", emoji: "🍫", portion: "1", grams: 45, kcal: 230, also: "chocolate" },
  { name: "Biscuit", emoji: "🍪", portion: "1", grams: 13, kcal: 60, also: "cookie digestive" },
  { name: "Cookie", emoji: "🍪", portion: "1 large", grams: 60, kcal: 280 },
  { name: "Cake", emoji: "🍰", portion: "a slice", grams: 80, kcal: 300, also: "sponge" },
  { name: "Brownie", emoji: "🍫", portion: "1", grams: 60, kcal: 250 },
  { name: "Muffin", emoji: "🧁", portion: "1", grams: 110, kcal: 400, also: "cupcake" },
  { name: "Doughnut", emoji: "🍩", portion: "1", grams: 60, kcal: 250, also: "donut" },
  { name: "Ice cream", emoji: "🍨", portion: "2 scoops", grams: 100, kcal: 210 },
  { name: "Cereal bar", emoji: "🍫", portion: "1", grams: 30, kcal: 120, also: "flapjack granola bar protein bar" },
  { name: "Sweets", emoji: "🍬", portion: "a small bag", grams: 40, kcal: 140, also: "candy gummies" },
  { name: "Rice cake", emoji: "🍘", portion: "1", grams: 9, kcal: 35 },
  // drinks
  { name: "Coffee with milk", emoji: "☕", portion: "a mug", grams: 250, kcal: 35, also: "coffee tea with milk" },
  { name: "Black coffee", emoji: "☕", portion: "a mug", grams: 250, kcal: 5, also: "espresso americano" },
  { name: "Tea with milk", emoji: "🍵", portion: "a mug", grams: 250, kcal: 25, also: "cuppa tea" },
  { name: "Latte", emoji: "☕", portion: "a regular", grams: 350, kcal: 190, also: "cappuccino flat white" },
  { name: "Hot chocolate", emoji: "☕", portion: "a mug", grams: 250, kcal: 200 },
  { name: "Orange juice", emoji: "🧃", portion: "a glass", grams: 200, kcal: 90, also: "juice" },
  { name: "Smoothie", emoji: "🥤", portion: "a bottle", grams: 250, kcal: 140 },
  { name: "Cola", emoji: "🥤", portion: "a can", grams: 330, kcal: 140, also: "fizzy drink soda coke pop" },
  { name: "Diet cola", emoji: "🥤", portion: "a can", grams: 330, kcal: 1, also: "diet coke zero" },
  { name: "Energy drink", emoji: "⚡", portion: "a can", grams: 250, kcal: 110 },
  { name: "Beer", emoji: "🍺", portion: "a pint", grams: 568, kcal: 220, also: "lager ale" },
  { name: "Wine", emoji: "🍷", portion: "a medium glass", grams: 175, kcal: 160 },
  { name: "Water", emoji: "💧", portion: "a glass", grams: 250, kcal: 0 },
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** "2 eggs" → 2 × egg; "half a pizza" → 0.5. Only for the estimate; the name stays as typed. */
export function splitCount(text: string): { count: number; rest: string } {
  const t = norm(text);
  const m = t.match(/^(\d+(?:\.\d+)?|a|an|one|two|three|four|half|half a|half an)\s+(?:x\s+)?(.*)$/);
  if (!m) return { count: 1, rest: t };
  const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, half: 0.5, "half a": 0.5, "half an": 0.5 };
  const count = words[m[1]] ?? Number(m[1]);
  return { count: count > 0 && count < 50 ? count : 1, rest: m[2] };
}

const singular = (w: string) => (w.length > 3 && w.endsWith("es") && !w.endsWith("ses") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);

/** Everyday foods that match what was typed, best first. */
export function estimate(text: string, limit = 5): Common[] {
  const { rest } = splitCount(text);
  const q = rest.split(" ").filter(Boolean).map(singular);
  if (!q.length || q.join("").length < 2) return [];
  const scored = COMMON.map((c) => {
    const name = norm(c.name);
    const words = `${name} ${norm(c.also ?? "")}`.split(" ").map(singular);
    const joined = q.join(" ");
    let score = 0;
    if (name === joined || singular(name) === joined) score = 100;
    else if (name.startsWith(joined)) score = 80;
    else {
      const hits = q.filter((w) => words.some((x) => x === w || (w.length >= 3 && x.startsWith(w)))).length;
      if (hits === q.length) score = 60 - (words.length - hits);
      else if (hits) score = 20 * (hits / q.length);
    }
    return { c, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.c);
}

/** "about 250" — calories are always shown rounded, to keep them rough. */
export function kcalText(k: number | null | undefined, rough = false): string {
  if (k == null) return "";
  const r = rough && k >= 100 ? Math.round(k / 5) * 5 : Math.round(k);
  return `${rough ? "about " : ""}${r.toLocaleString()} kcal`;
}

/** Calories for `grams` of something with `kcal100`. */
export const forGrams = (kcal100: number, grams: number) => Math.round((kcal100 * grams) / 100);

/** Adds up what has a number. `missing` counts the ones without. */
export function dayTotal(foods: Food[]): { kcal: number; missing: number } {
  let kcal = 0;
  let missing = 0;
  for (const f of foods) {
    if (f.kcal == null) missing++;
    else kcal += f.kcal;
  }
  return { kcal, missing };
}

export function infoTitle(i: Pick<FoodInfo, "name" | "brand">): string {
  return i.brand && !i.name.toLowerCase().includes(i.brand.toLowerCase()) ? `${i.name} · ${i.brand}` : i.name;
}

// ---- camera ------------------------------------------------------------------------------------

export const canUseCamera = isAndroid;

async function cameraAllowed(): Promise<boolean> {
  const { checkPermissions, requestPermissions } = await import("@tauri-apps/plugin-barcode-scanner");
  let perm = await checkPermissions();
  if (perm !== "granted") perm = await requestPermissions();
  return perm === "granted";
}

/** Opens the barcode scanner for food packaging. Returns the digits, or null if cancelled. */
export async function scanFoodBarcode(): Promise<string | null> {
  const { Format, scan } = await import("@tauri-apps/plugin-barcode-scanner");
  if (!(await cameraAllowed())) throw new Error("Tend needs permission to use the camera to scan barcodes.");
  try {
    document.documentElement.classList.add("is-scanning");
    const res = await scan({ windowed: false, formats: [Format.EAN13, Format.EAN8, Format.UPC_A, Format.UPC_E] });
    const digits = res.content.replace(/\D/g, "");
    return digits || null;
  } catch (e) {
    if (/cancel/i.test(String(e))) return null;
    throw e;
  } finally {
    document.documentElement.classList.remove("is-scanning");
  }
}

/** Takes a photo of a nutrition label and reads the calories off it, all on the phone. */
export async function readLabel(): Promise<LabelGuess | null> {
  if (!(await cameraAllowed())) throw new Error("Tend needs permission to use the camera to read labels.");
  const res = await invoke<{ text: string; cancelled: boolean }>("plugin:tend-native|read_label");
  if (res.cancelled) return null;
  return api.parseLabel(res.text);
}

// ---- daily goals -------------------------------------------------------------------------------

const FRUIT_VEG = new RegExp(
  "\\b(" +
    [
      "fruits?", "veg", "veggies?", "vegetables?", "salads?", "smoothies?",
      "apples?", "bananas?", "oranges?", "satsumas?", "clementines?", "mandarins?", "pears?", "grapes?", "berry", "berries",
      "strawberry", "strawberries", "raspberry", "raspberries", "blueberry", "blueberries", "melons?", "watermelons?", "mangos?", "mangoes",
      "pineapples?", "kiwis?", "raisins?", "sultanas?", "avocados?", "plums?", "peach", "peaches", "cherry", "cherries", "apricots?",
      "nectarines?", "dates", "figs?", "lettuce", "carrots?", "broccoli", "peas", "sweetcorn", "tomato", "tomatoes", "beans", "lentils",
      "chickpeas", "spinach", "cucumbers?", "peppers?", "onions?", "mushrooms?", "courgettes?", "zucchini", "cabbage", "cauliflower",
      "kale", "beetroot", "parsnips?", "sprouts", "leeks?", "celery", "sweet potato(es)?", "squash", "aubergines?", "eggplants?",
      "coleslaw", "stir fry veg",
    ].join("|") +
    ")\\b",
  "i",
);
const FRUIT_VEG_EMOJI = new Set(["🍎", "🍏", "🍌", "🍊", "🍋", "🍐", "🍇", "🍓", "🫐", "🍈", "🍉", "🥭", "🍍", "🥝", "🍑", "🍒", "🥑", "🥗", "🥕", "🥦", "🫛", "🌽", "🍅", "🥒", "🫑", "🥬", "🧅", "🍄", "🍆", "🫘"]);

/** A best guess at whether a food counts as fruit or veg (potatoes and chips don't, like the UK's 5 a day). */
export function guessFruitVeg(name: string, emoji = ""): boolean {
  if (/\b(chips|crisps|fries|potato(es)?|jam|ketchup|juice drink|cake|pie)\b/i.test(name) && !/sweet potato/i.test(name)) return false;
  return FRUIT_VEG.test(name) || FRUIT_VEG_EMOJI.has(emoji);
}

export const isWater = (f: Pick<Food, "name" | "emoji">) => f.emoji === "💧" || /^(a )?(glass of |bottle of )?(still |sparkling )?water$/i.test(f.name.trim());
export const countsAsFruitVeg = (f: Food) => !isWater(f) && (f.fruitVeg ?? guessFruitVeg(f.name, f.emoji));

/** Times eaten today: things noted within 45 minutes of each other count as one sitting. */
export function sittings(foods: Food[]): number {
  const times = foods.filter((f) => !isWater(f)).map((f) => f.at).sort((a, b) => a - b);
  let n = 0;
  let last = -Infinity;
  for (const t of times) {
    if (t - last > 45 * 60_000) n++;
    last = t;
  }
  return n;
}

export interface GoalProgress {
  meals: number;
  fruitVeg: number;
  water: number;
}

export function goalProgress(today: Food[]): GoalProgress {
  return { meals: sittings(today), fruitVeg: today.filter(countsAsFruitVeg).length, water: today.filter(isWater).length };
}

/** A glass of water, ready to save. */
export const waterGlass = (at: number): Food => ({
  id: "",
  name: "Water",
  emoji: "💧",
  meal: "",
  kcal: 0,
  amount: "1 glass",
  grams: 250,
  source: "manual",
  barcode: "",
  note: "",
  at,
  fruitVeg: false,
});
