import { format, isBefore, parseISO, startOfDay, subDays } from "date-fns";
import type { FullTask } from "./routine-data";
import { cycleDayFor } from "./cycle";
import { supabase } from "@/integrations/supabase/client";

export interface TaskStats {
  taskId: string;
  name: string;
  color: string;
  currentStreak: number;
  longestStreak: number;
  scheduledCount: number; // scheduled count within the requested window
  completedCount: number; // completed count within the requested window
  consistencyPct: number; // 0-100
}

/** A day "counts" against a task only if a variant is scheduled for that cycle day. */
function isScheduledOn(ft: FullTask, date: Date, cycleStart: Date): boolean {
  const day = cycleDayFor(date, cycleStart);
  const sched = ft.schedule.find((s) => s.cycle_day === day);
  return !!sched?.variant_id;
}

export async function computeStats(
  userId: string,
  routine: FullTask[],
  cycleStart: Date,
  windowDays = 90,
): Promise<TaskStats[]> {
  const since = format(subDays(new Date(), windowDays - 1), "yyyy-MM-dd");
  const { data } = await supabase
    .from("completions")
    .select("task_id, date, done")
    .eq("user_id", userId)
    .gte("date", since);
  const doneSet = new Set((data ?? []).filter((c) => c.done).map((c) => `${c.task_id}|${c.date}`));

  const today = new Date();
  const cycleStartDay = startOfDay(cycleStart);
  const out: TaskStats[] = [];

  for (const ft of routine) {
    let scheduledCount = 0;
    let completedCount = 0;
    let currentStreak = 0;
    let longestStreak = 0;
    let runStreak = 0;
    let currentBroken = false;

    // Walk from today backwards through the window.
    for (let i = 0; i < windowDays; i++) {
      const d = subDays(today, i);
      if (isBefore(startOfDay(d), cycleStartDay)) break;
      if (!isScheduledOn(ft, d, cycleStart)) continue;
      const key = `${ft.task.id}|${format(d, "yyyy-MM-dd")}`;
      const isDone = doneSet.has(key);
      if (i === 0 && !isDone) continue;

      scheduledCount++;
      if (isDone) {
        completedCount++;
        runStreak++;
        if (!currentBroken) currentStreak = runStreak;
        if (runStreak > longestStreak) longestStreak = runStreak;
      } else {
        currentBroken = true;
        runStreak = 0;
      }
    }

    out.push({
      taskId: ft.task.id,
      name: ft.task.name,
      color: ft.task.color,
      currentStreak,
      longestStreak,
      scheduledCount,
      completedCount,
      consistencyPct:
        scheduledCount === 0 ? 100 : Math.round((completedCount / scheduledCount) * 100),
    });
  }

  return out;
}

export function dateKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function parseDateKey(s: string): Date {
  return parseISO(s);
}
