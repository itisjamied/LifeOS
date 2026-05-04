// 28-day pattern encoded from the user's spreadsheet.
// Each pattern is a 28-length array of variant symbols or null (skip).
// Symbols: "x" | "dot" | "star" | "bar"

export type VariantSymbol = "x" | "dot" | "star" | "bar";

export interface SeedVariant {
  symbol: VariantSymbol;
  label: string;
  steps: string[];
}

export interface SeedTask {
  name: string;
  color: string; // CSS variable token name (e.g. "routine-oral")
  time_of_day: "am" | "pm" | "any";
  variants: SeedVariant[];
  // 28-length array — variant symbol for each cycle day, or null if not scheduled
  pattern: (VariantSymbol | null)[];
}

const dayAll = (sym: VariantSymbol): (VariantSymbol | null)[] =>
  Array.from({ length: 28 }, () => sym);

// Helper: build pattern from a list of {day: symbol}
const fromMap = (entries: Record<number, VariantSymbol>): (VariantSymbol | null)[] => {
  const out: (VariantSymbol | null)[] = Array.from({ length: 28 }, () => null);
  for (const [d, s] of Object.entries(entries)) out[Number(d) - 1] = s;
  return out;
};

export const SEED_TASKS: SeedTask[] = [
  {
    name: "oral am",
    color: "routine-oral",
    time_of_day: "am",
    variants: [{ symbol: "x", label: "morning oral", steps: ["brush", "scrape"] }],
    pattern: dayAll("x"),
  },
  {
    name: "skin am",
    color: "routine-skin-am",
    time_of_day: "am",
    variants: [
      {
        symbol: "x",
        label: "morning skin",
        steps: ["hydrating cleanse", "vitamin C", "beta glucan", "moisturizer", "sunscreen"],
      },
    ],
    pattern: dayAll("x"),
  },
  {
    name: "makeup am",
    color: "routine-makeup",
    time_of_day: "am",
    variants: [
      { symbol: "x", label: "makeup", steps: ["lash clusters", "brush brows", "lip-gloss"] },
    ],
    // From sheet: days 3,4,8,9,10,15,16,17,23,24,25
    pattern: fromMap({
      3: "x",
      4: "x",
      8: "x",
      9: "x",
      10: "x",
      15: "x",
      16: "x",
      17: "x",
      23: "x",
      24: "x",
      25: "x",
    }),
  },
  {
    name: "haircare",
    color: "routine-haircare",
    time_of_day: "any",
    variants: [
      { symbol: "x", label: "hydrate scalp", steps: ["hydrate / mist scalp", "oil scalp"] },
      {
        symbol: "dot",
        label: "wash day",
        steps: ["shampoo + condition", "leave-in", "oil"],
      },
      {
        symbol: "bar",
        label: "rebraid day",
        steps: [
          "unbraid",
          "detangle (w/ slip / conditioner)",
          "clarifying shampoo",
          "olaplex #8",
          "deep conditioner",
          "leave-in",
          "#7 oil",
        ],
      },
    ],
    // Days 2,3,4: x | 8,9,10: x | 16: dot (wash) | 17,18,19: x | 23,24,25: x | 26,27,28: bar (rebraid)
    pattern: fromMap({
      2: "x",
      3: "x",
      4: "x",
      8: "x",
      9: "x",
      10: "x",
      16: "dot",
      17: "x",
      18: "x",
      19: "x",
      23: "x",
      24: "x",
      25: "x",
      26: "bar",
      27: "bar",
      28: "bar",
    }),
  },
  {
    name: "shower pm",
    color: "routine-shower",
    time_of_day: "pm",
    variants: [
      { symbol: "x", label: "treatment wash", steps: ["treatment wash", "panoxyl pits"] },
      { symbol: "dot", label: "hydrating wash", steps: ["hydrating wash"] },
      {
        symbol: "star",
        label: "glycolic body day",
        steps: ["glycolic body treatment", "moisturizer"],
      },
    ],
    // Pattern from sheet (28 days, alternating-ish):
    pattern: [
      "x",
      "dot",
      "dot",
      "dot",
      "x",
      "x",
      "x",
      "x",
      "dot",
      "dot",
      "dot",
      "x",
      "x",
      "x",
      "x",
      "dot",
      "dot",
      "dot",
      "x",
      "x",
      "x",
      "x",
      "dot",
      "dot",
      "dot",
      "x",
      "x",
      "x",
    ],
  },
  {
    name: "shave",
    color: "routine-shave",
    time_of_day: "pm",
    variants: [
      {
        symbol: "star",
        label: "full shave",
        steps: ["shave whatever needed", "light moisture", "glycolic spray", "tranexamic"],
      },
      { symbol: "x", label: "touch-up shave", steps: ["touch-up shave", "light moisture"] },
      { symbol: "dot", label: "light prep", steps: ["light moisture only"] },
    ],
    // Sparse from sheet
    pattern: fromMap({
      2: "star",
      5: "x",
      8: "dot",
      9: "star",
      12: "x",
      14: "dot",
      15: "star",
      19: "x",
      21: "dot",
      22: "star",
      26: "x",
      28: "dot",
    }),
  },
  {
    name: "after-shower",
    color: "routine-after",
    time_of_day: "pm",
    variants: [
      { symbol: "dot", label: "retinol night", steps: ["retinol lotion", "heavy moisturizer"] },
      { symbol: "x", label: "just moisturize", steps: ["moisturizer"] },
      { symbol: "star", label: "glycolic spray + moist", steps: ["glycolic spray", "moisturizer"] },
    ],
    pattern: [
      "dot",
      "star",
      "star",
      "dot",
      "dot",
      "x",
      "x",
      "star",
      "dot",
      "star",
      "star",
      "dot",
      "x",
      "x",
      "star",
      "dot",
      "dot",
      "star",
      "x",
      "x",
      "star",
      "dot",
      "star",
      "star",
      "dot",
      "x",
      "x",
      "star",
    ],
  },
  {
    name: "oral pm",
    color: "routine-oral-pm",
    time_of_day: "pm",
    variants: [{ symbol: "x", label: "evening oral", steps: ["waterfloss", "brush", "scrape"] }],
    pattern: dayAll("x"),
  },
  {
    name: "string floss",
    color: "routine-floss",
    time_of_day: "pm",
    variants: [{ symbol: "x", label: "string floss", steps: ["string floss"] }],
    // Every 3 days from sheet: 1, 4, 7, 10, 13, 16, 19, 22, 25, 28
    pattern: fromMap({
      1: "x",
      4: "x",
      7: "x",
      10: "x",
      13: "x",
      16: "x",
      19: "x",
      22: "x",
      25: "x",
      28: "x",
    }),
  },
  {
    name: "skin pm",
    color: "routine-skin-pm",
    time_of_day: "pm",
    variants: [
      {
        symbol: "x",
        label: "evening skin",
        steps: ["oil cleanse", "water cleanse", "beta glucan", "tretinoin", "heavy moisturizer"],
      },
    ],
    pattern: dayAll("x"),
  },
  {
    name: "nail + foot care",
    color: "routine-nails",
    time_of_day: "any",
    variants: [
      { symbol: "dot", label: "foot exfoliant", steps: ["foot exfoliant", "heavy moisture"] },
      { symbol: "x", label: "cuticle oil", steps: ["cuticle oil"] },
    ],
    // weekly-ish: cuticle oil days 4, 11, 18, 25; foot exfoliant 7, 21
    pattern: fromMap({ 4: "x", 7: "dot", 11: "x", 18: "x", 21: "dot", 25: "x" }),
  },
];
