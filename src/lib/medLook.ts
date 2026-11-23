// What a medication looks like: its kind (tablet, capsule, pen…), the shape within that kind,
// colours for each part, and small features (score lines, imprint, fill level…).
// Saved with the med as `look`; `icon` + `color` are kept filled in for older versions.
import { COLORS } from "./meds";

export type OptValue = string | number | boolean;

export interface MedLook {
  v: 1;
  kind: string;
  shape: string;
  /** One hex colour per part of the kind (see `Kind.slots`). */
  colors: string[];
  opts: Record<string, OptValue>;
  /** Turn in degrees. */
  tilt: number;
}

export type Opt =
  | { key: string; label: string; type: "choice"; choices: { value: string; label: string }[]; def: string; only?: string[] }
  | { key: string; label: string; type: "toggle"; def: boolean; hint?: string; only?: string[] }
  | { key: string; label: string; type: "text"; def: string; max: number; placeholder: string; only?: string[] }
  | { key: string; label: string; type: "range"; def: number; min: number; max: number; step: number; unit?: string; only?: string[] };

export interface Kind {
  id: string;
  label: string;
  group: string;
  /** Words people might search for. */
  words: string;
  shapes: { id: string; label: string }[];
  /** Names of the parts that can be coloured, in order. */
  slots: string[];
  colors: string[];
  opts: Opt[];
  tilt: number;
  /** Shapes that sit better at another turn. */
  shapeTilt?: Record<string, number>;
  /** Closest old-style icon, for versions without the look studio. */
  legacy: string;
}

export const GROUPS = ["Tablets & pills", "Capsules", "Chewables & sweets", "Liquids & drops", "Injections", "Breathing & nose", "Skin", "Other"];

// --- Shared options -------------------------------------------------------------------------

const size: Opt = {
  key: "size",
  label: "Size",
  type: "choice",
  def: "m",
  choices: [
    { value: "s", label: "Small" },
    { value: "m", label: "Medium" },
    { value: "l", label: "Large" },
  ],
};
const finish = (def = "satin"): Opt => ({
  key: "finish",
  label: "Finish",
  type: "choice",
  def,
  choices: [
    { value: "matte", label: "Matte" },
    { value: "satin", label: "Satin" },
    { value: "glossy", label: "Glossy" },
    { value: "pearl", label: "Pearly" },
  ],
});
const imprint = (label = "Imprint", key = "imprint", only?: string[]): Opt => ({ key, label, type: "text", def: "", max: 6, placeholder: "e.g. 50", only });
const fill = (def = 70, label = "How full"): Opt => ({ key: "fill", label, type: "range", def, min: 0, max: 100, step: 5, unit: "%" });
const label: Opt = { key: "label", label: "Label", type: "toggle", def: true };
const labelText: Opt = { key: "labelText", label: "Label text", type: "text", def: "", max: 6, placeholder: "e.g. B12" };
const capOn: Opt = { key: "cap", label: "Cap on", type: "toggle", def: true };

// --- The catalogue --------------------------------------------------------------------------

export const KINDS: Kind[] = [
  {
    id: "tablet",
    label: "Tablet",
    group: "Tablets & pills",
    words: "pill tablet caplet scored round oval hard dispersible sublingual odt orodispersible sugar coated",
    shapes: [
      { id: "round", label: "Round" },
      { id: "oval", label: "Oval" },
      { id: "caplet", label: "Caplet" },
      { id: "almond", label: "Almond" },
      { id: "egg", label: "Egg" },
      { id: "triangle", label: "Triangle" },
      { id: "square", label: "Square" },
      { id: "rectangle", label: "Rectangle" },
      { id: "diamond", label: "Diamond" },
      { id: "pentagon", label: "Pentagon" },
      { id: "hexagon", label: "Hexagon" },
      { id: "octagon", label: "Octagon" },
      { id: "heart", label: "Heart" },
      { id: "shield", label: "Shield" },
      { id: "kidney", label: "Kidney" },
      { id: "teardrop", label: "Teardrop" },
      { id: "bullet", label: "Bullet" },
      { id: "halfmoon", label: "Half moon" },
      { id: "trapezoid", label: "Trapezoid" },
      { id: "star", label: "Star" },
      { id: "clover", label: "Clover" },
      { id: "flower", label: "Flower" },
      { id: "barrel", label: "Barrel" },
      { id: "tiny", label: "Tiny dot" },
    ],
    slots: ["Main", "Second colour", "Imprint ink"],
    colors: ["#f4f1ea", "#8fb7dd", "#4f6158"],
    opts: [
      {
        key: "score",
        label: "Score line",
        type: "choice",
        def: "none",
        choices: [
          { value: "none", label: "None" },
          { value: "line", label: "Half" },
          { value: "cross", label: "Quarters" },
          { value: "double", label: "Thirds" },
          { value: "long", label: "Lengthways" },
        ],
      },
      {
        key: "pattern",
        label: "Colouring",
        type: "choice",
        def: "plain",
        choices: [
          { value: "plain", label: "One colour" },
          { value: "split", label: "Two halves" },
          { value: "layered", label: "Two layers" },
          { value: "core", label: "Centre dot" },
          { value: "speckled", label: "Speckled" },
          { value: "marbled", label: "Marbled" },
        ],
      },
      {
        key: "edge",
        label: "Edge",
        type: "choice",
        def: "bevel",
        choices: [
          { value: "flat", label: "Flat" },
          { value: "bevel", label: "Bevelled" },
          { value: "domed", label: "Domed" },
        ],
      },
      finish(),
      imprint("Front imprint"),
      imprint("Back imprint", "imprintBack"),
      {
        key: "inkStyle",
        label: "Imprint style",
        type: "choice",
        def: "pressed",
        choices: [
          { value: "pressed", label: "Pressed in" },
          { value: "printed", label: "Printed" },
        ],
      },
      size,
    ],
    tilt: 0,
    legacy: "round",
  },
  {
    id: "effervescent",
    label: "Fizzy tablet",
    group: "Tablets & pills",
    words: "effervescent fizzy soluble dissolve water vitamin c disprin",
    shapes: [
      { id: "tablet", label: "Tablet" },
      { id: "glass", label: "In water" },
      { id: "tube", label: "Tube" },
    ],
    slots: ["Tablet", "Water / tube", "Cap"],
    colors: ["#f6f1e2", "#bfe0f0", "#f0a04b"],
    opts: [{ key: "fizz", label: "Bubbles", type: "toggle", def: true }, { ...imprint(), only: ["tablet"] }, { ...fill(75, "Water level"), only: ["glass"] }],
    tilt: 0,
    legacy: "round",
  },
  {
    id: "film",
    label: "Dissolving film",
    group: "Tablets & pills",
    words: "film strip oral dissolving buccal sublingual wafer thin melt",
    shapes: [
      { id: "strip", label: "Strip" },
      { id: "square", label: "Square" },
      { id: "round", label: "Round" },
      { id: "wafer", label: "Wafer" },
    ],
    slots: ["Film", "Print"],
    colors: ["#f1a7b9", "#ffffff"],
    opts: [{ key: "clear", label: "See-through", type: "toggle", def: true }, imprint("Printed text")],
    tilt: -12,
    legacy: "patch",
  },
  {
    id: "blister",
    label: "Blister pack",
    group: "Tablets & pills",
    words: "blister pack strip foil card calendar pack pill pack contraceptive",
    shapes: [
      { id: "b6", label: "6" },
      { id: "b8", label: "8" },
      { id: "b10", label: "10" },
      { id: "b14", label: "14" },
      { id: "b21", label: "21" },
      { id: "b28", label: "28" },
    ],
    slots: ["Foil", "Pills", "Pill second colour"],
    colors: ["#d7dde2", "#f4f1ea", "#8fb7dd"],
    opts: [
      {
        key: "pill",
        label: "What's inside",
        type: "choice",
        def: "round",
        choices: [
          { value: "round", label: "Round" },
          { value: "oval", label: "Oval" },
          { value: "capsule", label: "Capsule" },
          { value: "caplet", label: "Caplet" },
        ],
      },
      { key: "popped", label: "Already taken", type: "range", def: 2, min: 0, max: 28, step: 1 },
      { key: "days", label: "Day labels", type: "toggle", def: false },
    ],
    tilt: 0,
    legacy: "patch",
  },
  {
    id: "capsule",
    label: "Capsule",
    group: "Capsules",
    words: "capsule hard gelatin two tone beads pellets sprinkle modified release",
    shapes: [
      { id: "standard", label: "Standard" },
      { id: "long", label: "Long" },
      { id: "short", label: "Short" },
      { id: "tiny", label: "Tiny" },
      { id: "big", label: "Big" },
    ],
    slots: ["Cap", "Body", "Band", "Inside"],
    colors: ["#8fb7dd", "#f4f1ea", "#d9a93a", "#f4f1ea"],
    opts: [
      {
        key: "shell",
        label: "Shell",
        type: "choice",
        def: "opaque",
        choices: [
          { value: "opaque", label: "Solid" },
          { value: "clear", label: "Clear" },
          { value: "halfclear", label: "Half clear" },
        ],
      },
      {
        key: "inside",
        label: "Inside",
        type: "choice",
        def: "beads",
        choices: [
          { value: "beads", label: "Beads" },
          { value: "powder", label: "Powder" },
          { value: "liquid", label: "Liquid" },
          { value: "minitabs", label: "Mini tablets" },
        ],
      },
      { key: "band", label: "Sealing band", type: "toggle", def: false },
      { key: "stripe", label: "Printed stripe", type: "toggle", def: false },
      finish("glossy"),
      imprint("Cap imprint"),
      imprint("Body imprint", "imprintBack"),
      size,
    ],
    tilt: -35,
    shapeTilt: { tiny: -35 },
    legacy: "capsule",
  },
  {
    id: "softgel",
    label: "Softgel",
    group: "Capsules",
    words: "softgel soft gel liquid capsule fish oil omega vitamin d e gelcap liquigel",
    shapes: [
      { id: "oval", label: "Oval" },
      { id: "round", label: "Round" },
      { id: "oblong", label: "Oblong" },
      { id: "teardrop", label: "Teardrop" },
      { id: "twist", label: "Twist-off" },
      { id: "pearl", label: "Pearl" },
      { id: "fish", label: "Fish" },
    ],
    slots: ["Shell", "Liquid inside"],
    colors: ["#f0c25a", "#e7a63a"],
    opts: [
      { key: "clear", label: "See-through", type: "toggle", def: true },
      { key: "seam", label: "Seam", type: "toggle", def: true },
      finish("glossy"),
      imprint(),
      size,
    ],
    tilt: -25,
    shapeTilt: { round: 0, pearl: 0, fish: 0 },
    legacy: "oval",
  },
  {
    id: "gummy",
    label: "Gummy",
    group: "Chewables & sweets",
    words: "gummy chewable gummies vitamin bear jelly kids sweet melatonin",
    shapes: [
      { id: "bear", label: "Bear" },
      { id: "heart", label: "Heart" },
      { id: "star", label: "Star" },
      { id: "ring", label: "Ring" },
      { id: "round", label: "Round" },
      { id: "slice", label: "Fruit slice" },
      { id: "cube", label: "Cube" },
      { id: "fish", label: "Fish" },
      { id: "dino", label: "Dinosaur" },
      { id: "berry", label: "Berry" },
    ],
    slots: ["Main", "Second colour"],
    colors: ["#f08a8a", "#f6d36b"],
    opts: [
      { key: "sugar", label: "Sugar coated", type: "toggle", def: false },
      { key: "clear", label: "See-through", type: "toggle", def: true },
      { key: "twoTone", label: "Two colours", type: "toggle", def: false },
      size,
    ],
    tilt: 0,
    legacy: "round",
  },
  {
    id: "chewable",
    label: "Chewable tablet",
    group: "Chewables & sweets",
    words: "chewable tablet chew antacid calcium kids flavoured",
    shapes: [
      { id: "round", label: "Round" },
      { id: "square", label: "Square" },
      { id: "flower", label: "Flower" },
      { id: "animal", label: "Animal" },
      { id: "wafer", label: "Wafer" },
    ],
    slots: ["Main", "Speckles"],
    colors: ["#f4b9c9", "#ffffff"],
    opts: [{ key: "speckled", label: "Speckled", type: "toggle", def: true }, imprint(), size],
    tilt: 0,
    legacy: "round",
  },
  {
    id: "lozenge",
    label: "Lozenge",
    group: "Chewables & sweets",
    words: "lozenge pastille troche throat sweet lollipop gum nicotine gum cough drop",
    shapes: [
      { id: "round", label: "Round" },
      { id: "pastille", label: "Pastille" },
      { id: "square", label: "Square" },
      { id: "diamond", label: "Diamond" },
      { id: "oval", label: "Oval" },
      { id: "triangle", label: "Triangle" },
      { id: "ring", label: "With hole" },
      { id: "gum", label: "Gum" },
      { id: "lollipop", label: "Lollipop" },
    ],
    slots: ["Main", "Wrapper / stick"],
    colors: ["#e9a23b", "#f4f1ea"],
    opts: [
      { key: "wrapper", label: "Twist wrapper", type: "toggle", def: false },
      { key: "clear", label: "See-through", type: "toggle", def: true },
      { key: "sugar", label: "Sugar dusted", type: "toggle", def: false },
      imprint("Pressed-in letters"),
    ],
    tilt: 0,
    legacy: "round",
  },
  {
    id: "globules",
    label: "Sugar pills",
    group: "Chewables & sweets",
    words: "globules pillules sugar pills homeopathic sugar cube drops on sugar pellets",
    shapes: [
      { id: "pile", label: "Little pile" },
      { id: "vial", label: "In a tube" },
      { id: "cube", label: "Sugar cube" },
      { id: "single", label: "One" },
    ],
    slots: ["Sugar", "Tube", "Cap"],
    colors: ["#f7f4ee", "#e6eef2", "#6f9a6a"],
    opts: [{ key: "drop", label: "Drop on top", type: "toggle", def: false }],
    tilt: 0,
    legacy: "round",
  },
  {
    id: "bottle",
    label: "Bottle",
    group: "Liquids & drops",
    words: "bottle syrup liquid oral solution suspension elixir mixture linctus medicine pill bottle pharmacy",
    shapes: [
      { id: "syrup", label: "Syrup" },
      { id: "round", label: "Round" },
      { id: "tall", label: "Tall" },
      { id: "flask", label: "Flask" },
      { id: "pills", label: "Pill bottle" },
      { id: "vial", label: "Drink vial" },
    ],
    slots: ["Bottle", "Inside", "Cap", "Label"],
    colors: ["#b8742e", "#d0582f", "#f4f1ea", "#f4f1ea"],
    opts: [fill(), label, labelText, { key: "cup", label: "Measuring cup", type: "toggle", def: false, only: ["syrup", "round", "tall"] }],
    tilt: 0,
    legacy: "bottle",
  },
  {
    id: "drops",
    label: "Drops",
    group: "Liquids & drops",
    words: "drops eye ear nose dropper pipette minim liquid tincture oil",
    shapes: [
      { id: "squeeze", label: "Eye / ear" },
      { id: "pipette", label: "Pipette" },
      { id: "minim", label: "Single use" },
      { id: "drop", label: "Just a drop" },
    ],
    slots: ["Bottle", "Cap", "Liquid", "Label"],
    colors: ["#f4f1ea", "#5a88b8", "#8fc9e6", "#8fb7dd"],
    opts: [{ key: "falling", label: "Falling drop", type: "toggle", def: true }, { ...fill(60), only: ["pipette"] }, label],
    tilt: 0,
    legacy: "drop",
  },
  {
    id: "measure",
    label: "Spoon & measure",
    group: "Liquids & drops",
    words: "spoon teaspoon tablespoon measuring cup oral syringe dosing syringe dose cup",
    shapes: [
      { id: "spoon", label: "Spoon" },
      { id: "dosespoon", label: "Dosing spoon" },
      { id: "cup", label: "Cup" },
      { id: "oralsyringe", label: "Oral syringe" },
    ],
    slots: ["Tool", "Liquid", "Accent"],
    colors: ["#f4f1ea", "#e78b4f", "#8a74c2"],
    opts: [fill(65, "How much")],
    tilt: -30,
    shapeTilt: { cup: 0 },
    legacy: "spoon",
  },
  {
    id: "syringe",
    label: "Syringe",
    group: "Injections",
    words: "syringe injection needle jab shot prefilled insulin syringe intramuscular subcutaneous",
    shapes: [
      { id: "standard", label: "Standard" },
      { id: "insulin", label: "Insulin" },
      { id: "prefilled", label: "Prefilled" },
      { id: "big", label: "Large" },
    ],
    slots: ["Liquid", "Plunger", "Needle cap"],
    colors: ["#bfe0f0", "#f4f1ea", "#f0a04b"],
    opts: [fill(70), { key: "needleCap", label: "Needle cap on", type: "toggle", def: false }, { key: "marks", label: "Measure marks", type: "toggle", def: true }],
    tilt: 45,
    legacy: "syringe",
  },
  {
    id: "pen",
    label: "Pen",
    group: "Injections",
    words: "pen injector insulin pen autoinjector epipen adrenaline weekly pen ozempic wegovy mounjaro click",
    shapes: [
      { id: "insulin", label: "Insulin pen" },
      { id: "auto", label: "Autoinjector" },
      { id: "dial", label: "Dial pen" },
      { id: "slim", label: "Slim" },
    ],
    slots: ["Body", "Cap", "Button", "Band"],
    colors: ["#e6eaee", "#5a88b8", "#5a88b8", "#d9a93a"],
    opts: [capOn, { key: "window", label: "Window", type: "toggle", def: true }, { key: "band", label: "Colour band", type: "toggle", def: true }, labelText],
    tilt: 40,
    legacy: "syringe",
  },
  {
    id: "vial",
    label: "Vial",
    group: "Injections",
    words: "vial injection bottle rubber stopper flip cap powder reconstitute",
    shapes: [
      { id: "standard", label: "Standard" },
      { id: "small", label: "Small" },
      { id: "tall", label: "Tall" },
    ],
    slots: ["Glass", "Inside", "Flip cap", "Label"],
    colors: ["#e8f1f4", "#cfe4ec", "#d46a45", "#f4f1ea"],
    opts: [fill(60), { key: "powder", label: "Powder inside", type: "toggle", def: false }, label, labelText],
    tilt: 0,
    legacy: "bottle",
  },
  {
    id: "ampoule",
    label: "Ampoule",
    group: "Injections",
    words: "ampoule ampule glass snap break b12 injection drinkable",
    shapes: [
      { id: "glass", label: "Glass" },
      { id: "tall", label: "Tall" },
      { id: "plastic", label: "Plastic" },
      { id: "open", label: "Opened" },
    ],
    slots: ["Glass", "Liquid", "Neck ring"],
    colors: ["#e8f1f4", "#f0a0b0", "#d46a45"],
    opts: [fill(70), { key: "dots", label: "Snap dot", type: "toggle", def: true }],
    tilt: 0,
    legacy: "bottle",
  },
  {
    id: "infusion",
    label: "Infusion",
    group: "Injections",
    words: "infusion drip iv bag intravenous saline chemo",
    shapes: [
      { id: "bag", label: "Bag" },
      { id: "bottle", label: "Bottle" },
      { id: "drip", label: "On a stand" },
    ],
    slots: ["Bag", "Liquid", "Port"],
    colors: ["#eef3f5", "#d8eef6", "#5a88b8"],
    opts: [fill(80), { key: "line", label: "Line", type: "toggle", def: true }, labelText],
    tilt: 0,
    legacy: "bottle",
  },
  {
    id: "pump",
    label: "Pump",
    group: "Injections",
    words: "insulin pump patch pump pod cgm sensor omnipod tubing",
    shapes: [
      { id: "pump", label: "With tubing" },
      { id: "pod", label: "Patch pod" },
      { id: "sensor", label: "Sensor" },
    ],
    slots: ["Body", "Screen", "Accent"],
    colors: ["#6e7f8d", "#bfe0f0", "#86ad74"],
    opts: [],
    tilt: 0,
    legacy: "syringe",
  },
  {
    id: "implant",
    label: "Implant",
    group: "Injections",
    words: "implant rod contraceptive implant nexplanon pellet depot",
    shapes: [
      { id: "rod", label: "Rod" },
      { id: "two", label: "Two rods" },
      { id: "pellet", label: "Pellet" },
    ],
    slots: ["Implant"],
    colors: ["#f4f1ea"],
    opts: [],
    tilt: -30,
    legacy: "patch",
  },
  {
    id: "inhaler",
    label: "Inhaler",
    group: "Breathing & nose",
    words: "inhaler puffer mdi dry powder diskus accuhaler turbohaler respimat ellipta spacer asthma copd",
    shapes: [
      { id: "mdi", label: "Puffer" },
      { id: "disc", label: "Disc" },
      { id: "turbo", label: "Twist" },
      { id: "mist", label: "Soft mist" },
      { id: "flat", label: "Flat" },
      { id: "spacer", label: "With spacer" },
    ],
    slots: ["Body", "Canister / cap", "Accent"],
    colors: ["#8fb7dd", "#5a88b8", "#f4f1ea"],
    opts: [capOn, { key: "counter", label: "Dose counter", type: "toggle", def: true }],
    tilt: 0,
    legacy: "inhaler",
  },
  {
    id: "nebuliser",
    label: "Nebuliser",
    group: "Breathing & nose",
    words: "nebuliser nebulizer nebules respules mask mist",
    shapes: [
      { id: "nebules", label: "Nebules" },
      { id: "cup", label: "Mouthpiece" },
      { id: "mask", label: "Mask" },
    ],
    slots: ["Plastic", "Liquid", "Accent"],
    colors: ["#eef3f5", "#cfe4ec", "#8a74c2"],
    opts: [{ key: "mist", label: "Mist", type: "toggle", def: true }],
    tilt: 0,
    legacy: "spray",
  },
  {
    id: "spray",
    label: "Spray",
    group: "Breathing & nose",
    words: "spray nasal nose mouth throat sublingual spray gtn pump",
    shapes: [
      { id: "nasal", label: "Nose" },
      { id: "mouth", label: "Mouth" },
      { id: "throat", label: "Throat" },
      { id: "mini", label: "Mini" },
    ],
    slots: ["Bottle", "Nozzle", "Cap", "Label"],
    colors: ["#f4f1ea", "#f4f1ea", "#5a88b8", "#8fb7dd"],
    opts: [{ ...capOn, def: false }, { key: "mist", label: "Mist", type: "toggle", def: true }, label],
    tilt: 0,
    legacy: "spray",
  },
  {
    id: "patch",
    label: "Patch",
    group: "Skin",
    words: "patch transdermal plaster hrt nicotine fentanyl contraceptive pain plaster heat",
    shapes: [
      { id: "square", label: "Square" },
      { id: "round", label: "Round" },
      { id: "rectangle", label: "Rectangle" },
      { id: "oval", label: "Oval" },
      { id: "plaster", label: "Plaster" },
      { id: "clear", label: "Clear" },
    ],
    slots: ["Backing", "Centre", "Print"],
    colors: ["#e9d6c0", "#d8b98f", "#7d8d85"],
    opts: [{ key: "pad", label: "Centre", type: "toggle", def: true }, { key: "peel", label: "Peeling corner", type: "toggle", def: false }, imprint("Printed text")],
    tilt: -8,
    legacy: "patch",
  },
  {
    id: "tube",
    label: "Tube",
    group: "Skin",
    words: "tube cream ointment gel eye ointment toothpaste topical steroid",
    shapes: [
      { id: "cream", label: "Cream" },
      { id: "flip", label: "Flip cap" },
      { id: "eye", label: "Eye ointment" },
      { id: "big", label: "Big" },
    ],
    slots: ["Tube", "Cap", "Stripe", "Cream"],
    colors: ["#f4f1ea", "#5a88b8", "#8fb7dd", "#ffffff"],
    opts: [{ key: "stripe", label: "Stripe", type: "toggle", def: true }, { key: "squeeze", label: "Squeezed out", type: "toggle", def: false }, labelText],
    tilt: -35,
    shapeTilt: { eye: -35 },
    legacy: "tube",
  },
  {
    id: "jar",
    label: "Pot",
    group: "Skin",
    words: "jar pot tub cream emollient balm ointment",
    shapes: [
      { id: "low", label: "Low pot" },
      { id: "tub", label: "Tub" },
      { id: "tin", label: "Tin" },
    ],
    slots: ["Pot", "Lid", "Cream", "Label"],
    colors: ["#f4f1ea", "#86ad74", "#ffffff", "#dbe8d8"],
    opts: [{ key: "open", label: "Lid off", type: "toggle", def: false }, label, labelText],
    tilt: 0,
    legacy: "tube",
  },
  {
    id: "dispenser",
    label: "Pump & foam",
    group: "Skin",
    words: "pump bottle lotion gel foam aerosol can roll on emollient shampoo wash",
    shapes: [
      { id: "pump", label: "Pump" },
      { id: "foam", label: "Foam can" },
      { id: "rollon", label: "Roll-on" },
      { id: "dropper", label: "Serum" },
      { id: "shampoo", label: "Wash" },
    ],
    slots: ["Bottle", "Top", "Label"],
    colors: ["#f4f1ea", "#7d8d85", "#b7a6dc"],
    opts: [label, labelText],
    tilt: 0,
    legacy: "spray",
  },
  {
    id: "suppository",
    label: "Suppository",
    group: "Other",
    words: "suppository pessary vaginal rectal applicator enema ovule",
    shapes: [
      { id: "bullet", label: "Bullet" },
      { id: "torpedo", label: "Torpedo" },
      { id: "pessary", label: "Pessary" },
      { id: "applicator", label: "Applicator" },
      { id: "enema", label: "Enema" },
    ],
    slots: ["Main", "Wrapper"],
    colors: ["#f6edd8", "#c9d1d6"],
    opts: [{ key: "foil", label: "Half wrapped", type: "toggle", def: false }, finish("satin")],
    tilt: -30,
    shapeTilt: { pessary: 0, enema: 0 },
    legacy: "oval",
  },
  {
    id: "ring",
    label: "Ring & IUD",
    group: "Other",
    words: "vaginal ring nuvaring estring iud coil mirena hormonal",
    shapes: [
      { id: "ring", label: "Ring" },
      { id: "iud", label: "IUD" },
    ],
    slots: ["Main", "Thread"],
    colors: ["#f4f1ea", "#8fb7dd"],
    opts: [{ key: "clear", label: "See-through", type: "toggle", def: true }],
    tilt: 0,
    legacy: "patch",
  },
  {
    id: "sachet",
    label: "Powder",
    group: "Other",
    words: "sachet powder granules stick pack scoop oral rehydration fibre laxative movicol protein",
    shapes: [
      { id: "sachet", label: "Sachet" },
      { id: "stick", label: "Stick pack" },
      { id: "scoop", label: "Scoop" },
      { id: "pile", label: "Granules" },
      { id: "tub", label: "Tub" },
    ],
    slots: ["Packet", "Powder", "Print"],
    colors: ["#f4f1ea", "#f6ebc9", "#86ad74"],
    opts: [{ key: "stripe", label: "Stripe", type: "toggle", def: true }, { key: "torn", label: "Torn open", type: "toggle", def: false }, labelText],
    tilt: 0,
    legacy: "sachet",
  },
  {
    id: "tea",
    label: "Tea & herbal",
    group: "Other",
    words: "tea herbal infusion tisane chamomile drink mug cup",
    shapes: [
      { id: "bag", label: "Tea bag" },
      { id: "mug", label: "Mug" },
      { id: "leaf", label: "Leaves" },
    ],
    slots: ["Main", "Tag / drink", "String"],
    colors: ["#e8d6b3", "#86ad74", "#f4f1ea"],
    opts: [{ key: "steam", label: "Steam", type: "toggle", def: true }],
    tilt: 0,
    legacy: "sachet",
  },
];

export const kindOf = (id: string) => KINDS.find((k) => k.id === id) ?? KINDS[0];

// --- Colours ---------------------------------------------------------------------------------

/** The palette, in rows that read well together. */
export const PALETTE: { name: string; hex: string }[][] = [
  [
    { name: "White", hex: "#f7f5f0" },
    { name: "Cream", hex: "#f3e8cc" },
    { name: "Ivory", hex: "#efe6d2" },
    { name: "Pale grey", hex: "#d7dde2" },
    { name: "Grey", hex: "#9aa5ad" },
    { name: "Slate", hex: "#66737c" },
    { name: "Charcoal", hex: "#3a4248" },
    { name: "Black", hex: "#22272b" },
  ],
  [
    { name: "Butter", hex: "#f6e08a" },
    { name: "Yellow", hex: "#f0cd4a" },
    { name: "Gold", hex: "#d9a93a" },
    { name: "Apricot", hex: "#f3b77c" },
    { name: "Orange", hex: "#ef8d3c" },
    { name: "Peach", hex: "#f6c2a6" },
    { name: "Coral", hex: "#ef9a78" },
    { name: "Brick", hex: "#c8603e" },
  ],
  [
    { name: "Blush", hex: "#f6cdd5" },
    { name: "Pink", hex: "#eda7b4" },
    { name: "Rose", hex: "#d9738b" },
    { name: "Cherry", hex: "#c84a5a" },
    { name: "Maroon", hex: "#8c3a48" },
    { name: "Magenta", hex: "#c65aa0" },
    { name: "Lilac", hex: "#c9b8e6" },
    { name: "Purple", hex: "#8a74c2" },
  ],
  [
    { name: "Ice", hex: "#d4ebf5" },
    { name: "Baby blue", hex: "#a9cde9" },
    { name: "Sky", hex: "#8fb7dd" },
    { name: "Blue", hex: "#4f86c6" },
    { name: "Navy", hex: "#2f4a7a" },
    { name: "Teal", hex: "#3f9a9c" },
    { name: "Aqua", hex: "#8fd6cf" },
    { name: "Mint", hex: "#bfe6cf" },
  ],
  [
    { name: "Sage", hex: "#86ad74" },
    { name: "Green", hex: "#4f9a5c" },
    { name: "Forest", hex: "#2f6b45" },
    { name: "Olive", hex: "#8c8f4a" },
    { name: "Sand", hex: "#d8b98f" },
    { name: "Tan", hex: "#b88d5e" },
    { name: "Amber glass", hex: "#b8742e" },
    { name: "Brown", hex: "#7a5236" },
  ],
];

export const PALETTE_FLAT = PALETTE.flat();

export function colorName(hex: string) {
  const exact = PALETTE_FLAT.find((p) => p.hex.toLowerCase() === hex.toLowerCase());
  if (exact) return exact.name;
  let best = PALETTE_FLAT[0];
  let dist = Infinity;
  const [r, g, b] = rgb(hex);
  for (const p of PALETTE_FLAT) {
    const [r2, g2, b2] = rgb(p.hex);
    const d = (r - r2) ** 2 * 0.3 + (g - g2) ** 2 * 0.59 + (b - b2) ** 2 * 0.11;
    if (d < dist) [best, dist] = [p, d];
  }
  return best.name;
}

export function rgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h.slice(0, 6), 16);
  return isNaN(n) ? [200, 200, 200] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (c: number[]) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

/** Mix towards white (amt > 0) or a deep ink (amt < 0). */
export function shade(hex: string, amt: number) {
  const c = rgb(hex);
  const target = amt > 0 ? [255, 255, 255] : [24, 32, 28];
  const a = Math.abs(amt);
  return toHex(c.map((v, i) => v + (target[i] - v) * a));
}

export function lum(hex: string) {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Readable ink for text drawn on this colour. */
export const inkOn = (hex: string) => (lum(hex) > 0.6 ? shade(hex, -0.62) : shade(hex, 0.7));

export const isHex = (s: unknown): s is string => typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);

// --- Building, reading and describing looks --------------------------------------------------

export function optDefaults(kind: Kind): Record<string, OptValue> {
  return Object.fromEntries(kind.opts.map((o) => [o.key, o.def]));
}

export function newLook(kindId: string, shape?: string, colors?: string[]): MedLook {
  const k = kindOf(kindId);
  const sh = shape && k.shapes.some((s) => s.id === shape) ? shape : k.shapes[0].id;
  return { v: 1, kind: k.id, shape: sh, colors: k.slots.map((_, i) => colors?.[i] ?? k.colors[i]), opts: optDefaults(k), tilt: tiltFor(k.id, sh) };
}

/** The turn a shape looks best at. */
export function tiltFor(kindId: string, shape: string) {
  const k = kindOf(kindId);
  return k.shapeTilt?.[shape] ?? k.tilt;
}

/** Changes kind while keeping as much of the look as makes sense (colours, size, finish). */
export function switchKind(look: MedLook, kindId: string): MedLook {
  const from = kindOf(look.kind);
  const k = kindOf(kindId);
  const next = newLook(kindId);
  // Only carry over what someone actually chose; untouched defaults give way to the new kind's.
  if (look.colors[0] && look.colors[0] !== from.colors[0]) next.colors[k.id === "drops" ? 2 : 0] = look.colors[0];
  for (const key of ["size", "finish", "imprint"]) {
    const was = from.opts.find((o) => o.key === key);
    const now = k.opts.find((o) => o.key === key);
    if (was && now && key in look.opts && look.opts[key] !== was.def && typeof look.opts[key] === typeof now.def) next.opts[key] = look.opts[key];
  }
  return next;
}

/** Fills in anything missing or wrong, so a look from anywhere (sync, an older build) is safe to draw. */
export function cleanLook(raw: unknown): MedLook | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<MedLook>;
  if (typeof r.kind !== "string" || !KINDS.some((k) => k.id === r.kind)) return null;
  const k = kindOf(r.kind);
  const base = newLook(k.id, typeof r.shape === "string" ? r.shape : undefined);
  const colors = k.slots.map((_, i) => (Array.isArray(r.colors) && isHex(r.colors[i]) ? r.colors[i] : base.colors[i]));
  const opts = { ...base.opts };
  if (r.opts && typeof r.opts === "object") {
    for (const o of k.opts) {
      const v = (r.opts as Record<string, unknown>)[o.key];
      if (o.type === "choice" && typeof v === "string" && o.choices.some((c) => c.value === v)) opts[o.key] = v;
      if (o.type === "toggle" && typeof v === "boolean") opts[o.key] = v;
      if (o.type === "text" && typeof v === "string") opts[o.key] = v.slice(0, o.max);
      if (o.type === "range" && typeof v === "number" && isFinite(v)) opts[o.key] = Math.max(o.min, Math.min(o.max, v));
    }
  }
  const tilt = typeof r.tilt === "number" && isFinite(r.tilt) ? ((Math.round(r.tilt) % 360) + 360) % 360 : tiltFor(k.id, base.shape);
  return { v: 1, kind: k.id, shape: base.shape, colors, opts, tilt: tilt > 180 ? tilt - 360 : tilt };
}

/** The look for a med saved before the look studio: just an icon name and a colour name. */
export function legacyLook(icon: string, color: string): MedLook {
  const [a, b] = COLORS[color] ?? COLORS.white;
  const map: Record<string, [string, string, Record<string, OptValue>?]> = {
    round: ["tablet", "round"],
    oval: ["tablet", "oval", { score: "line" }],
    split: ["tablet", "round", { pattern: "split" }],
    capsule: ["capsule", "standard"],
    drop: ["drops", "drop"],
    bottle: ["bottle", "syrup"],
    syringe: ["syringe", "standard"],
    inhaler: ["inhaler", "mdi"],
    spray: ["spray", "nasal"],
    patch: ["patch", "square"],
    sachet: ["sachet", "sachet"],
    tube: ["tube", "cream"],
    spoon: ["measure", "spoon"],
  };
  const [kind, shape, opts] = map[icon] ?? map.round;
  const look = newLook(kind, shape);
  if (kind === "capsule" || icon === "split") look.colors = [a, b, ...look.colors.slice(2)];
  else if (kind === "tablet" || kind === "drops" || kind === "patch") look.colors[kind === "drops" ? 2 : 0] = a;
  else look.colors[0] = a;
  if (kind === "drops") look.colors[1] = b;
  if (kind === "bottle" || kind === "tube" || kind === "spray" || kind === "inhaler") look.colors[1] = b;
  Object.assign(look.opts, opts ?? {});
  return look;
}

/** A med's look: its saved look, or one made from its old icon and colour. */
export function lookOf(m: { icon: string; color: string; look?: unknown }): MedLook {
  return cleanLook(m.look) ?? legacyLook(m.icon, m.color);
}

/** Nearest old icon + colour name, saved alongside the look for older versions. */
export function legacyOf(look: MedLook): { icon: string; color: string } {
  const k = kindOf(look.kind);
  let icon = k.legacy;
  if (look.kind === "tablet") icon = look.opts.pattern === "split" ? "split" : ["oval", "caplet", "almond", "egg"].includes(look.shape) ? "oval" : "round";
  const main = look.kind === "drops" ? look.colors[2] : look.colors[0];
  let color = "white";
  let dist = Infinity;
  const [r, g, b] = rgb(main);
  for (const [name, [hex]] of Object.entries(COLORS)) {
    const [r2, g2, b2] = rgb(hex);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < dist) [color, dist] = [name, d];
  }
  return { icon, color };
}

/** The kind a new med starts as, from what each dose is measured in. */
export const FORM_LOOKS: Record<string, [string, string?]> = {
  pill: ["tablet", "round"],
  tablet: ["tablet", "oval"],
  capsule: ["capsule"],
  softgel: ["softgel"],
  drop: ["drops"],
  ml: ["bottle"],
  mg: ["tablet", "round"],
  g: ["sachet"],
  IU: ["softgel", "round"],
  unit: ["pen", "insulin"],
  click: ["pen", "dial"],
  injection: ["syringe"],
  puff: ["inhaler"],
  spray: ["spray"],
  patch: ["patch"],
  sachet: ["sachet"],
  application: ["tube"],
  teaspoon: ["measure", "spoon"],
  tablespoon: ["measure", "spoon"],
  suppository: ["suppository"],
  pessary: ["suppository", "pessary"],
  ampoule: ["ampoule"],
  vial: ["vial"],
  portion: ["measure", "cup"],
  lozenge: ["lozenge"],
  gummy: ["gummy"],
  chewable: ["chewable"],
  strip: ["film"],
  nebule: ["nebuliser"],
  ring: ["ring"],
  implant: ["implant"],
  globule: ["globules"],
  scoop: ["sachet", "scoop"],
  cup: ["tea", "mug"],
};

export function lookForForm(form: string, colors?: string[]): MedLook {
  const [kind, shape] = FORM_LOOKS[form] ?? ["tablet", "round"];
  return newLook(kind, shape, colors);
}

/** "Pink heart tablet, scored in half, '50'" — read out for screen readers and shown under the preview. */
export function describeLook(look: MedLook): string {
  const k = kindOf(look.kind);
  const shape = k.shapes.find((s) => s.id === look.shape)?.label ?? "";
  const main = colorName(look.kind === "drops" ? look.colors[2] : look.colors[0]).toLowerCase();
  const o = look.opts;
  const two =
    (look.kind === "capsule" && look.colors[1] !== look.colors[0]) || (look.kind === "tablet" && o.pattern !== "plain" && o.pattern !== "core")
      ? ` and ${colorName(look.colors[1]).toLowerCase()}`
      : "";
  const noun = k.label.toLowerCase();
  const shapeWord = shape && !["Standard", "Just a drop"].includes(shape) && shape.toLowerCase() !== noun ? `${shape.toLowerCase()} ` : "";
  const bits = [`${main}${two} ${shapeWord}${noun}`];
  if (o.score && o.score !== "none") bits.push(o.score === "line" ? "scored" : o.score === "cross" ? "scored in quarters" : o.score === "double" ? "scored in thirds" : "scored lengthways");
  if (o.pattern === "speckled" || o.speckled === true) bits.push("speckled");
  if (o.shell === "clear") bits.push("clear shell");
  if (typeof o.imprint === "string" && o.imprint.trim()) bits.push(`“${o.imprint.trim()}”`);
  if (typeof o.labelText === "string" && o.labelText.trim()) bits.push(`“${o.labelText.trim()}”`);
  const s = bits.join(", ");
  return s[0].toUpperCase() + s.slice(1);
}

/** Visible options for the current shape. */
export const optsFor = (look: MedLook) => kindOf(look.kind).opts.filter((o) => !o.only || o.only.includes(look.shape));

/** A gentle random look within a kind: harmonious colours, a few features. */
export function surprise(look: MedLook, rand = Math.random): MedLook {
  const k = kindOf(look.kind);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const row = pick(PALETTE);
  const next = newLook(k.id, pick(k.shapes).id);
  next.colors = k.slots.map((_, i) => (i === 0 ? pick(row).hex : rand() < 0.5 ? pick(row).hex : pick(PALETTE_FLAT).hex));
  for (const o of k.opts) {
    if (o.type === "choice" && rand() < 0.6) next.opts[o.key] = pick(o.choices).value;
    if (o.type === "toggle" && rand() < 0.4) next.opts[o.key] = !o.def;
    if (o.type === "range" && o.key === "fill") next.opts[o.key] = 30 + Math.round(rand() * 12) * 5;
  }
  if (k.id === "tablet" && next.opts.pattern === "marbled" && rand() < 0.5) next.opts.pattern = "plain";
  next.tilt = tiltFor(k.id, next.shape);
  return next;
}

export const sameLook = (a: MedLook, b: MedLook) => JSON.stringify(a) === JSON.stringify(b);

/** Quick starting points that look like common medicines. */
export const PRESETS: { label: string; make: () => MedLook }[] = [
  { label: "White, scored", make: () => tweak(newLook("tablet", "round"), {}, { score: "line" }) },
  { label: "Blue & white capsule", make: () => newLook("capsule", "standard") },
  { label: "Yellow oval", make: () => tweak(newLook("tablet", "oval"), { 0: "#f0cd4a" }, { score: "line" }) },
  { label: "Pink heart", make: () => tweak(newLook("tablet", "heart"), { 0: "#eda7b4" }) },
  { label: "Fish oil", make: () => newLook("softgel", "oblong") },
  { label: "Vitamin gummy", make: () => tweak(newLook("gummy", "bear"), { 0: "#ef8d3c" }, { sugar: true }) },
  { label: "Insulin pen", make: () => newLook("pen", "insulin") },
  { label: "Reliever inhaler", make: () => newLook("inhaler", "mdi") },
  { label: "Brown inhaler", make: () => tweak(newLook("inhaler", "mdi"), { 0: "#b88d5e", 1: "#7a5236" }) },
  { label: "Eye drops", make: () => newLook("drops", "squeeze") },
  { label: "Liquid medicine", make: () => tweak(newLook("bottle", "syrup"), {}, { cup: true }) },
  { label: "Pill pack", make: () => tweak(newLook("blister", "b28"), {}, { days: true, popped: 5 }) },
  { label: "HRT patch", make: () => tweak(newLook("patch", "round"), { 0: "#efe6d2" }) },
  { label: "Weekly pen", make: () => tweak(newLook("pen", "dial"), { 1: "#4f86c6", 2: "#4f86c6" }) },
];

function tweak(look: MedLook, colors: Record<number, string>, opts: Record<string, OptValue> = {}): MedLook {
  const c = [...look.colors];
  for (const [i, hex] of Object.entries(colors)) c[Number(i)] = hex;
  return { ...look, colors: c, opts: { ...look.opts, ...opts } };
}

/** What a dose of this look is usually counted in, for new meds. */
export function formForLook(look: MedLook): string {
  const byShape: Record<string, string> = {
    "measure/spoon": "teaspoon",
    "measure/dosespoon": "teaspoon",
    "pen/dial": "click",
    "pen/auto": "injection",
    "suppository/pessary": "pessary",
    "suppository/enema": "application",
    "suppository/applicator": "pessary",
    "sachet/scoop": "scoop",
    "sachet/tub": "scoop",
    "sachet/pile": "g",
    "tablet/tiny": "pill",
    "tablet/round": "pill",
  };
  const byKind: Record<string, string> = {
    tablet: "tablet",
    effervescent: "tablet",
    film: "strip",
    blister: "tablet",
    capsule: "capsule",
    softgel: "softgel",
    gummy: "gummy",
    chewable: "chewable",
    lozenge: "lozenge",
    globules: "globule",
    bottle: "ml",
    drops: "drop",
    measure: "ml",
    syringe: "injection",
    pen: "unit",
    vial: "vial",
    ampoule: "ampoule",
    infusion: "ml",
    pump: "unit",
    implant: "implant",
    inhaler: "puff",
    nebuliser: "nebule",
    spray: "spray",
    patch: "patch",
    tube: "application",
    jar: "application",
    dispenser: "application",
    suppository: "suppository",
    ring: "ring",
    sachet: "sachet",
    tea: "cup",
  };
  return byShape[`${look.kind}/${look.shape}`] ?? byKind[look.kind] ?? "pill";
}

/** Two looks that would be hard to tell apart at a glance. */
export function lookAlike(a: MedLook, b: MedLook) {
  const same = (x: string[], y: string[]) => x.slice(0, 2).every((c, i) => c.toLowerCase() === (y[i] ?? "").toLowerCase());
  return a.kind === b.kind && a.shape === b.shape && same(a.colors, b.colors) && (a.opts.imprint ?? "") === (b.opts.imprint ?? "") && (a.opts.labelText ?? "") === (b.opts.labelText ?? "");
}
