import { addDays, format, isBefore, isToday, startOfDay, subDays } from "date-fns";
import type { FullTask } from "./routine-data";
import { cycleDayFor } from "./cycle";
import { supabase } from "@/integrations/supabase/client";

export interface DayEntry {
  date: Date;
  iso: string;
  scheduled: boolean;
  done: boolean;
}

export async function fetchHabitHistory(
  userId: string,
  ft: FullTask,
  cycleStart: Date,
  windowDays = 90,
  startDate?: Date,
): Promise<DayEntry[]> {
  const firstDate = startDate ?? subDays(new Date(), windowDays - 1);
  const lastDate = startDate ? addDays(firstDate, windowDays - 1) : new Date();
  const since = format(firstDate, "yyyy-MM-dd");
  const until = format(lastDate, "yyyy-MM-dd");
  const { data } = await supabase
    .from("completions")
    .select("date, done")
    .eq("user_id", userId)
    .eq("task_id", ft.task.id)
    .gte("date", since)
    .lte("date", until);
  const doneSet = new Set((data ?? []).filter((c) => c.done).map((c) => c.date));

  const today = new Date();
  const cycleStartDay = startOfDay(cycleStart);
  const entries: DayEntry[] = [];
  for (let i = 0; i < windowDays; i++) {
    const d = startDate ? addDays(firstDate, i) : subDays(today, windowDays - 1 - i);
    const day = cycleDayFor(d, cycleStart);
    const sched = ft.schedule.find((s) => s.cycle_day === day);
    const iso = format(d, "yyyy-MM-dd");
    const isBeforeCycleStart = isBefore(startOfDay(d), cycleStartDay);
    entries.push({
      date: d,
      iso,
      scheduled: !isBeforeCycleStart && !!sched?.variant_id,
      done: doneSet.has(iso),
    });
  }
  return entries;
}

export interface StreakRun {
  start: Date;
  end: Date;
  length: number;
}

export function computeStreakRuns(entries: DayEntry[]): StreakRun[] {
  const runs: StreakRun[] = [];
  let curStart: Date | null = null;
  let curEnd: Date | null = null;
  let len = 0;
  for (const e of entries) {
    if (!e.scheduled) continue;
    if (isToday(e.date) && !e.done) continue;
    if (e.done) {
      if (!curStart) curStart = e.date;
      curEnd = e.date;
      len++;
    } else {
      if (curStart && curEnd) runs.push({ start: curStart, end: curEnd, length: len });
      curStart = null;
      curEnd = null;
      len = 0;
    }
  }
  if (curStart && curEnd) runs.push({ start: curStart, end: curEnd, length: len });
  return runs.sort((a, b) => b.length - a.length);
}
