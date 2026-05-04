import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { seedRoutineIfEmpty } from "@/lib/seed-routine";
import {
  fetchAllRoutine,
  fetchCompletionsForDate,
  fetchProfile,
  type FullTask,
  type CompletionRow,
} from "@/lib/routine-data";
import { cycleDayFor } from "@/lib/cycle";
import { glyphFor, colorValue } from "@/lib/symbols";
import { format, parseISO, addDays, subDays, isToday as isTodayFn, isSameDay } from "date-fns";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Sparkles,
  Sun,
  Moon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";

type TodayTask = {
  task: FullTask["task"];
  variant: FullTask["variants"][number];
  completion?: CompletionRow;
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today — Cycle" },
      {
        name: "description",
        content: "Your maintenance routine for today, grouped morning and evening.",
      },
    ],
  }),
  component: TodayPage,
});

function TodayPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [routine, setRoutine] = useState<FullTask[] | null>(null);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [cycleStart, setCycleStart] = useState<Date | null>(null);
  const [busy, setBusy] = useState(true);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setBusy(true);
      try {
        await seedRoutineIfEmpty(user.id);
        const [data, profile] = await Promise.all([
          fetchAllRoutine(user.id),
          fetchProfile(user.id),
        ]);
        setRoutine(data);
        setCycleStart(profile?.cycle_start_date ? parseISO(profile.cycle_start_date) : new Date());
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Failed to load routine");
      } finally {
        setBusy(false);
      }
    })();
  }, [user]);

  const viewDateStr = format(viewDate, "yyyy-MM-dd");

  // Reload completions whenever the viewed date changes
  useEffect(() => {
    if (!user) return;
    (async () => {
      const c = await fetchCompletionsForDate(user.id, viewDateStr);
      setCompletions(c);
    })();
  }, [user, viewDateStr]);

  const day = useMemo(
    () => (cycleStart ? cycleDayFor(viewDate, cycleStart) : 1),
    [cycleStart, viewDate],
  );
  const isViewingToday = isTodayFn(viewDate);
  const isFuture = viewDate.getTime() > new Date().setHours(23, 59, 59, 999);

  const todaysTasks = useMemo(() => {
    if (!routine) return [];
    return routine.flatMap((ft): TodayTask[] => {
      const sched = ft.schedule.find((s) => s.cycle_day === day);
      if (!sched || !sched.variant_id) return [];
      const variant = ft.variants.find((v) => v.id === sched.variant_id);
      if (!variant) return [];
      const completion = completions.find((c) => c.task_id === ft.task.id);
      return [{ task: ft.task, variant, completion }];
    });
  }, [routine, day, completions]);

  const amTasks = todaysTasks.filter((t) => t.task.time_of_day === "am");
  const pmTasks = todaysTasks.filter((t) => t.task.time_of_day === "pm");
  const anyTasks = todaysTasks.filter((t) => t.task.time_of_day === "any");
  const otherTasks = todaysTasks.filter((t) => t.task.time_of_day === "other");

  async function toggleStep(taskId: string, step: string, allSteps: string[]) {
    if (!user || isFuture) return;
    const existing = completions.find((c) => c.task_id === taskId);
    const current = (existing?.completed_steps as string[] | null) ?? [];
    const next = current.includes(step) ? current.filter((s) => s !== step) : [...current, step];
    const done = next.length >= allSteps.length;
    const wasDone = !!existing?.done;

    if (done && !wasDone && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.([12, 40, 18]);
    } else if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(8);
    }

    setCompletions((prev) => {
      const without = prev.filter((c) => c.task_id !== taskId);
      const row: CompletionRow = {
        id: existing?.id ?? "tmp",
        user_id: user.id,
        task_id: taskId,
        date: viewDateStr,
        completed_steps: next,
        done,
        completed_at: done ? new Date().toISOString() : null,
      };
      return [...without, row];
    });

    const { data, error } = await supabase
      .from("completions")
      .upsert(
        {
          user_id: user.id,
          task_id: taskId,
          date: viewDateStr,
          completed_steps: next,
          done,
          completed_at: done ? new Date().toISOString() : null,
        },
        { onConflict: "user_id,task_id,date" },
      )
      .select()
      .single();
    if (error) {
      toast.error("Couldn't save");
    } else if (data) {
      setCompletions((prev) => prev.map((c) => (c.task_id === taskId ? data : c)));
    }
  }

  if (loading || busy) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Sparkles className="mr-2 h-4 w-4 animate-pulse" /> loading your cycle…
      </div>
    );
  }

  return (
    <div className="px-5 pt-10 animate-fade-up">
      <header className="mb-5 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {format(viewDate, "EEEE, MMM d")}
          </p>
          <h1 className="mt-1 text-4xl text-foreground">
            {isViewingToday ? "Today" : format(viewDate, "MMM d")}
          </h1>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs">
            <span className="pop-dot inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="font-semibold text-foreground">Day {day}</span>
            <span className="text-muted-foreground">/ 28</span>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Date navigation */}
      <div className="mb-6 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setViewDate((d) => subDays(d, 1))}
          className="surface surface-interactive flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Previous day"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {!isViewingToday && (
          <button
            type="button"
            onClick={() => {
              const d = new Date();
              d.setHours(0, 0, 0, 0);
              setViewDate(d);
            }}
            className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-transform hover:scale-105"
          >
            Jump to today
          </button>
        )}
        <button
          type="button"
          onClick={() => setViewDate((d) => addDays(d, 1))}
          disabled={isSameDay(viewDate, new Date())}
          className="surface surface-interactive flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground"
          aria-label="Next day"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {!isViewingToday && !isFuture && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            Catch up — taps still count.
          </span>
        )}
      </div>

      {todaysTasks.length === 0 ? (
        <div className="surface p-8 text-center text-muted-foreground">
          <Sparkles className="mx-auto mb-2 h-5 w-5 text-primary animate-wiggle" />
          Nothing scheduled. Enjoy a rest day.
        </div>
      ) : (
        <>
          <Section
            icon={<Sun className="h-4 w-4" />}
            title="Morning"
            tasks={amTasks}
            openTask={openTask}
            setOpenTask={setOpenTask}
            onToggle={toggleStep}
            disabled={isFuture}
          />
          <Section
            icon={<Sparkles className="h-4 w-4" />}
            title="Anytime"
            tasks={anyTasks}
            openTask={openTask}
            setOpenTask={setOpenTask}
            onToggle={toggleStep}
            disabled={isFuture}
          />
          <Section
            icon={<Moon className="h-4 w-4" />}
            title="Evening"
            tasks={pmTasks}
            openTask={openTask}
            setOpenTask={setOpenTask}
            onToggle={toggleStep}
            disabled={isFuture}
          />
          <Section
            icon={<CircleDashed className="h-4 w-4" />}
            title="Other"
            tasks={otherTasks}
            openTask={openTask}
            setOpenTask={setOpenTask}
            onToggle={toggleStep}
            disabled={isFuture}
          />
        </>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  tasks,
  openTask,
  setOpenTask,
  onToggle,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  tasks: TodayTask[];
  openTask: string | null;
  setOpenTask: (id: string | null) => void;
  onToggle: (taskId: string, step: string, all: string[]) => void;
  disabled?: boolean;
}) {
  if (tasks.length === 0) return null;
  return (
    <section className="mb-7 animate-fade-up">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {title}
      </h2>
      <ul className="space-y-2">
        {tasks.map(({ task, variant, completion }) => {
          const steps = (variant.steps as string[]) ?? [];
          const done = (completion?.completed_steps as string[] | null) ?? [];
          const isDone = !!completion?.done;
          const isOpen = openTask === task.id;
          const fillColor = colorValue(task.color);
          return (
            <li key={task.id} className="surface surface-interactive relative overflow-hidden">
              {/* Color fill sweep when complete */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 origin-left transition-transform duration-500 ease-out"
                style={{
                  backgroundColor: fillColor,
                  opacity: isDone ? 0.18 : 0,
                  transform: isDone ? "scaleX(1)" : "scaleX(0)",
                }}
              />
              <button
                type="button"
                onClick={() => setOpenTask(isOpen ? null : task.id)}
                className="relative flex w-full items-center gap-3 px-4 py-3.5 text-left"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold text-white transition-transform ${isOpen ? "scale-110" : ""}`}
                  style={{ backgroundColor: colorValue(task.color) }}
                  aria-hidden
                >
                  {isDone ? (
                    <Check className="h-5 w-5 animate-check" strokeWidth={3} />
                  ) : (
                    glyphFor(variant.symbol)
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-base font-semibold ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}
                  >
                    {task.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {variant.label} · {done.length}/{steps.length}
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen && (
                <ul className="relative border-t border-border bg-muted/40 px-2 py-2 animate-fade-up">
                  {steps.map((step) => {
                    const checked = done.includes(step);
                    return (
                      <li key={step}>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onToggle(task.id, step, steps)}
                          className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-card disabled:opacity-50"
                        >
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                              checked
                                ? "border-primary bg-primary text-primary-foreground scale-110"
                                : "border-border bg-card"
                            }`}
                          >
                            {checked && (
                              <Check className="h-3.5 w-3.5 animate-check" strokeWidth={3} />
                            )}
                          </span>
                          <span
                            className={`text-sm transition-colors ${checked ? "text-muted-foreground line-through" : "text-foreground"}`}
                          >
                            {step}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {disabled && (
                    <li className="px-2.5 py-1.5 text-[11px] text-muted-foreground">
                      Future day — can't check off yet.
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
