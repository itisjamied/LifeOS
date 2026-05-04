import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { SEED_TASKS } from "@/lib/routine-seed";

type ScheduleInsert = Database["public"]["Tables"]["task_schedule"]["Insert"];

// Prevents concurrent seeds within the same browser tab (StrictMode double-mount,
// fast re-renders) from racing and inserting duplicate tasks.
const inflight = new Map<string, Promise<boolean>>();

/**
 * Seeds the user's routine if they have zero tasks.
 * Idempotent — checks first, and de-duplicates concurrent calls per user.
 */
export async function seedRoutineIfEmpty(userId: string): Promise<boolean> {
  const existing = inflight.get(userId);
  if (existing) return existing;
  const p = (async () => {
    const { count } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if ((count ?? 0) > 0) return false;
    return await runSeed(userId);
  })().finally(() => inflight.delete(userId));
  inflight.set(userId, p);
  return p;
}

async function runSeed(userId: string): Promise<boolean> {
  for (let i = 0; i < SEED_TASKS.length; i++) {
    const t = SEED_TASKS[i];
    const { data: task, error: tErr } = await supabase
      .from("tasks")
      .insert({
        user_id: userId,
        name: t.name,
        color: t.color,
        sort_order: i,
        time_of_day: t.time_of_day,
      })
      .select("id")
      .single();
    if (tErr || !task) throw tErr ?? new Error("task insert failed");

    const variantRows = t.variants.map((v, idx) => ({
      user_id: userId,
      task_id: task.id,
      symbol: v.symbol,
      label: v.label,
      steps: v.steps,
      sort_order: idx,
    }));
    const { data: variants, error: vErr } = await supabase
      .from("task_variants")
      .insert(variantRows)
      .select("id, symbol");
    if (vErr || !variants) throw vErr ?? new Error("variants insert failed");

    const symbolToId = new Map(variants.map((v) => [v.symbol, v.id]));
    const scheduleRows = t.pattern.flatMap((sym, idx): ScheduleInsert[] => {
      if (!sym) return [];
      const vid = symbolToId.get(sym);
      if (!vid) return [];
      return [
        {
          user_id: userId,
          task_id: task.id,
          cycle_day: idx + 1,
          variant_id: vid,
        },
      ];
    });

    if (scheduleRows.length) {
      const { error: sErr } = await supabase.from("task_schedule").insert(scheduleRows);
      if (sErr) throw sErr;
    }
  }
  return true;
}
