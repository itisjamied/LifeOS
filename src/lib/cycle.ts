import { differenceInCalendarDays, formatISO, startOfDay } from "date-fns";

/** Returns the cycle day (1..28) for a given actual date and cycle start. */
export function cycleDayFor(date: Date, cycleStart: Date): number {
  const diff = differenceInCalendarDays(startOfDay(date), startOfDay(cycleStart));
  // Modulo, handling negatives
  const m = ((diff % 28) + 28) % 28;
  return m + 1;
}

export function todayISO(date: Date = new Date()): string {
  return formatISO(date, { representation: "date" });
}

export const SYMBOL_GLYPH: Record<string, string> = {
  x: "✕",
  dot: "●",
  star: "★",
  bar: "▬",
};
