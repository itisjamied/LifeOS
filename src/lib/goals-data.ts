import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

export const WEEK_DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type WeekDayKey = (typeof WEEK_DAY_KEYS)[number];
export type WeeklyGoalsRow = Database["public"]["Tables"]["weekly_goals"]["Row"];

export type GoalItem = {
  id: string;
  text: string;
  done: boolean;
};

export type DailyGoals = Record<WeekDayKey, GoalItem[]>;

export type WeeklyGoalsData = {
  id: string | null;
  weekStart: string;
  intention: string;
  dailyGoals: DailyGoals;
  updatedAt: string | null;
};

export function createGoalItem(text = ""): GoalItem {
  return {
    id: newId(),
    text,
    done: false,
  };
}

export function createEmptyDailyGoals(): DailyGoals {
  return WEEK_DAY_KEYS.reduce((acc, key) => {
    acc[key] = Array.from({ length: 3 }, () => createGoalItem());
    return acc;
  }, {} as DailyGoals);
}

export function createEmptyWeeklyGoals(weekStart: string): WeeklyGoalsData {
  return {
    id: null,
    weekStart,
    intention: "",
    dailyGoals: createEmptyDailyGoals(),
    updatedAt: null,
  };
}

export function serializeGoalsPayload(data: WeeklyGoalsData) {
  return JSON.stringify({
    weekStart: data.weekStart,
    intention: data.intention,
    dailyGoals: data.dailyGoals,
  });
}

export async function fetchWeeklyGoals(userId: string, weekStart: string) {
  const { data, error } = await supabase
    .from("weekly_goals")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (error) throw error;
  return normalizeWeeklyGoals(data, weekStart);
}

export async function saveWeeklyGoals(userId: string, data: WeeklyGoalsData) {
  const { data: saved, error } = await supabase
    .from("weekly_goals")
    .upsert(
      {
        user_id: userId,
        week_start: data.weekStart,
        intention: data.intention,
        daily_goals: data.dailyGoals as unknown as Json,
      },
      { onConflict: "user_id,week_start" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return normalizeWeeklyGoals(saved, data.weekStart);
}

function normalizeWeeklyGoals(row: WeeklyGoalsRow | null, weekStart: string): WeeklyGoalsData {
  if (!row) return createEmptyWeeklyGoals(weekStart);

  return {
    id: row.id,
    weekStart: row.week_start,
    intention: row.intention ?? "",
    dailyGoals: normalizeDailyGoals(row.daily_goals),
    updatedAt: row.updated_at,
  };
}

function normalizeDailyGoals(value: Json): DailyGoals {
  const source = isRecord(value) ? value : {};
  return WEEK_DAY_KEYS.reduce((acc, key) => {
    acc[key] = normalizeGoalItems(source[key] as Json, 3, 3);
    return acc;
  }, {} as DailyGoals);
}

function normalizeGoalItems(value: Json, minimum = 0, maximum?: number): GoalItem[] {
  const rawItems = Array.isArray(value) ? value : [];
  const normalized: GoalItem[] = [];

  for (const item of rawItems) {
    if (!isRecord(item)) continue;
    normalized.push({
      id: typeof item.id === "string" && item.id ? item.id : newId(),
      text: typeof item.text === "string" ? item.text : "",
      done: item.done === true,
    });
  }

  while (normalized.length < minimum) normalized.push(createGoalItem());
  return typeof maximum === "number" ? normalized.slice(0, maximum) : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function newId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `goal-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
