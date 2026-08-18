import { format, isBefore, parseISO, startOfDay, subDays } from "date-fns";
import type { FullTask } from "./routine-data";
import { scheduleDayFor } from "./schedule";
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

/** A day counts against a task only if a variant is scheduled for that recurring day. */
function isScheduledOn(ft: FullTask, date: Date, scheduleStart: Date): boolean {
  const day = scheduleDayFor(date, scheduleStart);
  const sched = ft.schedule.find((s) => s.schedule_slot === day);
  return !!sched?.variant_id;
}

export async function computeStats(
  userId: string,
  routine: FullTask[],
  scheduleStart: Date,
  windowDays = 90,
): Promise<TaskStats[]> {
  const since = format(subDays(new Date(), windowDays - 1), "yyyy-MM-dd");
  const result = await supabase
    .from("completions")
    .select("task_id, date, done, skipped")
    .eq("user_id", userId)
    .gte("date", since);

  let rows = result.data ?? [];
  if (result.error && isMissingSkippedColumnError(result.error)) {
    const fallback = await supabase
      .from("completions")
      .select("task_id, date, done")
      .eq("user_id", userId)
      .gte("date", since);
    rows = (fallback.data ?? []).map((row) => ({ ...row, skipped: false }));
  }

  const doneSet = new Set(rows.filter((c) => c.done).map((c) => `${c.task_id}|${c.date}`));
  const skippedSet = new Set(rows.filter((c) => c.skipped).map((c) => `${c.task_id}|${c.date}`));

  const today = new Date();
  const scheduleStartDay = startOfDay(scheduleStart);
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
      if (isBefore(startOfDay(d), scheduleStartDay)) break;
      if (!isScheduledOn(ft, d, scheduleStart)) continue;
      const key = `${ft.task.id}|${format(d, "yyyy-MM-dd")}`;
      if (skippedSet.has(key)) continue;
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

function isMissingSkippedColumnError(error: {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
}) {
  const text = [error.message, error.details, error.hint, error.code]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return text.includes("skipped") && (text.includes("column") || text.includes("schema cache"));
}
