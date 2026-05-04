import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
export type VariantRow = Database["public"]["Tables"]["task_variants"]["Row"];
export type ScheduleRow = Database["public"]["Tables"]["task_schedule"]["Row"];
export type CompletionRow = Database["public"]["Tables"]["completions"]["Row"];

export interface FullTask {
  task: TaskRow;
  variants: VariantRow[];
  schedule: ScheduleRow[]; // length up to 28
}

export async function fetchAllRoutine(userId: string): Promise<FullTask[]> {
  const [{ data: tasks }, { data: variants }, { data: schedule }] = await Promise.all([
    supabase.from("tasks").select("*").eq("user_id", userId).order("sort_order"),
    supabase.from("task_variants").select("*").eq("user_id", userId).order("sort_order"),
    supabase.from("task_schedule").select("*").eq("user_id", userId),
  ]);
  const out: FullTask[] = [];
  for (const t of tasks ?? []) {
    out.push({
      task: t,
      variants: (variants ?? []).filter((v) => v.task_id === t.id),
      schedule: (schedule ?? []).filter((s) => s.task_id === t.id),
    });
  }
  return out;
}

export async function fetchCompletionsForDate(userId: string, date: string) {
  const { data } = await supabase
    .from("completions")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date);
  return data ?? [];
}

export async function fetchProfile(userId: string) {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
  return data;
}
