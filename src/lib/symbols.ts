// Curated symbol presets for variants. Stored in DB as the `symbol` field.
// Existing seed data uses the first 4 keys, so they remain canonical.

export const SYMBOL_PRESETS: { key: string; glyph: string; label: string }[] = [
  { key: "x", glyph: "✕", label: "standard" },
  { key: "dot", glyph: "●", label: "alternate" },
  { key: "star", glyph: "★", label: "special" },
  { key: "bar", glyph: "▬", label: "rebraid" },
  { key: "tri", glyph: "▲", label: "triangle" },
  { key: "sq", glyph: "■", label: "square" },
  { key: "diamond", glyph: "◆", label: "diamond" },
  { key: "ring", glyph: "◯", label: "ring" },
  { key: "spark", glyph: "✦", label: "spark" },
  { key: "drop", glyph: "💧", label: "hydrate" },
  { key: "sun", glyph: "☀", label: "morning" },
  { key: "moon", glyph: "☾", label: "night" },
];

const map: Record<string, string> = Object.fromEntries(SYMBOL_PRESETS.map((s) => [s.key, s.glyph]));

export function glyphFor(key: string | null | undefined): string {
  if (!key) return "•";
  return map[key] ?? key; // fall back to the key itself (lets free-text symbols still display)
}

// Resolve a stored color value (preset token like "routine-oral" OR a raw CSS
// color like "#ff8800" / "rgb(...)") into something usable in `style`.
export function colorValue(color: string | null | undefined): string {
  if (!color) return "var(--primary)";
  const c = color.trim();
  if (!c) return "var(--primary)";
  // Anything that already looks like a CSS color literal — pass through.
  if (
    c.startsWith("#") ||
    c.startsWith("rgb") ||
    c.startsWith("hsl") ||
    c.startsWith("oklch") ||
    c.startsWith("var(")
  ) {
    return c;
  }
  // Otherwise treat as a design-token name.
  return `var(--${c})`;
}

export function isHexColor(v: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim());
}

// Pick the first emoji / character from arbitrary text input.
export function firstGrapheme(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  type SegmenterConstructor = new (
    locales?: string | string[],
    options?: { granularity: "grapheme" },
  ) => {
    segment(input: string): Iterable<{ segment: string }>;
  };

  const Segmenter = (Intl as typeof Intl & { Segmenter?: SegmenterConstructor }).Segmenter;
  if (Segmenter) {
    try {
      const seg = new Segmenter(undefined, { granularity: "grapheme" });
      const first = seg.segment(trimmed)[Symbol.iterator]().next().value;
      return first?.segment ?? Array.from(trimmed)[0] ?? "";
    } catch {
      return Array.from(trimmed)[0] ?? "";
    }
  }

  return Array.from(trimmed)[0] ?? "";
}

export const COLOR_TOKENS: { token: string; label: string }[] = [
  { token: "routine-oral", label: "blue" },
  { token: "routine-skin-am", label: "sage" },
  { token: "routine-makeup", label: "pink" },
  { token: "routine-haircare", label: "terra" },
  { token: "routine-shower", label: "deep blue" },
  { token: "routine-shave", label: "taupe" },
  { token: "routine-after", label: "navy" },
  { token: "routine-oral-pm", label: "mid blue" },
  { token: "routine-floss", label: "indigo" },
  { token: "routine-skin-pm", label: "lime" },
  { token: "routine-nails", label: "yellow" },
];
