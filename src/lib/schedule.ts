import { differenceInCalendarDays, formatISO, startOfDay } from "date-fns";

/** Returns the recurring schedule position for a given date and schedule start. */
export function scheduleDayFor(date: Date, scheduleStart: Date): number {
  const diff = differenceInCalendarDays(startOfDay(date), startOfDay(scheduleStart));
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
