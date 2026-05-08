import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
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
  CalendarDays,
  CircleDashed,
  Plus,
  Sparkles,
  Sun,
  Moon,
  UserRound,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";

type TodayTask = {
  task: FullTask["task"];
  variant: FullTask["variants"][number];
  completion?: CompletionRow;
};

type TimeFilter = "all" | "am" | "any" | "pm" | "other";

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
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
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
  const unfinishedCounts = {
    am: countUnfinished(amTasks),
    any: countUnfinished(anyTasks),
    pm: countUnfinished(pmTasks),
    other: countUnfinished(otherTasks),
  };
  const visibleTaskCount =
    timeFilter === "all"
      ? todaysTasks.length
      : timeFilter === "am"
        ? amTasks.length
        : timeFilter === "any"
          ? anyTasks.length
          : timeFilter === "pm"
            ? pmTasks.length
            : otherTasks.length;

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
    <div className="px-5 pt-8 animate-fade-up">
      <header className="mb-6">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <div className="h-full flex flex-col justify-center">
            <Link to="/settings" className="icon-button" aria-label="Settings" title="Settings">
              <UserRound className="h-[18px] w-[18px]" />
            </Link>
          </div>
          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">
              {format(viewDate, "EEE, MMM d")}
            </p>
            <h1 className="mt-1 text-3xl text-foreground">
              {isViewingToday ? "Today" : format(viewDate, "MMM d")}
            </h1>
          </div>
          <div className="flex flex-col gap-y-4 items-center gap-2">
            <ThemeToggle />
            <Link to="/grid" className="icon-button" aria-label="Cycle grid" title="Cycle grid">
              <CalendarDays className="h-[18px] w-[18px]" />
            </Link>
          </div>
        </div>
      </header>

      <div className="mb-6 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setViewDate((d) => subDays(d, 1))}
          className="icon-button"
          aria-label="Previous day"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            setViewDate(d);
          }}
          disabled={isViewingToday}
          className="inline-flex min-w-24 items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-bold text-foreground shadow-sm transition-transform active:scale-95 disabled:opacity-100"
          aria-label={`Cycle day ${day} of 28`}
        >
          <span className="pop-dot inline-block h-2 w-2 rounded-full bg-primary" />
          {day}
          <span className="text-muted-foreground">/28</span>
        </button>
        <button
          type="button"
          onClick={() => setViewDate((d) => addDays(d, 1))}
          disabled={isSameDay(viewDate, new Date())}
          className="icon-button disabled:opacity-35 disabled:hover:translate-y-0 disabled:hover:text-muted-foreground"
          aria-label="Next day"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <TimeStrip
        active={timeFilter}
        onSelect={(next) => {
          setTimeFilter((current) => (current === next && next !== "all" ? "all" : next));
          setOpenTask(null);
        }}
        counts={{
          am: amTasks.length,
          any: anyTasks.length,
          pm: pmTasks.length,
          other: otherTasks.length,
        }}
        unfinishedCounts={unfinishedCounts}
      />

      {todaysTasks.length === 0 ? (
        <div className="surface p-8 text-center text-muted-foreground">
          <Sparkles className="mx-auto mb-2 h-5 w-5 text-primary animate-wiggle" />
          Rest day
        </div>
      ) : visibleTaskCount === 0 ? (
        <div className="surface p-8 text-center text-muted-foreground">
          <Sparkles className="mx-auto mb-2 h-5 w-5 text-primary animate-wiggle" />
          No tasks here
        </div>
      ) : (
        <>
          {(timeFilter === "all" || timeFilter === "am") && (
            <Section
              icon={<Sun className="h-4 w-4" />}
              title="Morning"
              tasks={amTasks}
              openTask={openTask}
              setOpenTask={setOpenTask}
              onToggle={toggleStep}
              disabled={isFuture}
            />
          )}
          {(timeFilter === "all" || timeFilter === "any") && (
            <Section
              icon={<Sparkles className="h-4 w-4" />}
              title="Anytime"
              tasks={anyTasks}
              openTask={openTask}
              setOpenTask={setOpenTask}
              onToggle={toggleStep}
              disabled={isFuture}
            />
          )}
          {(timeFilter === "all" || timeFilter === "pm") && (
            <Section
              icon={<Moon className="h-4 w-4" />}
              title="Evening"
              tasks={pmTasks}
              openTask={openTask}
              setOpenTask={setOpenTask}
              onToggle={toggleStep}
              disabled={isFuture}
            />
          )}
          {(timeFilter === "all" || timeFilter === "other") && (
            <Section
              icon={<CircleDashed className="h-4 w-4" />}
              title="Other"
              tasks={otherTasks}
              openTask={openTask}
              setOpenTask={setOpenTask}
              onToggle={toggleStep}
              disabled={isFuture}
            />
          )}
        </>
      )}
    </div>
  );
}

function TimeStrip({
  active,
  counts,
  unfinishedCounts,
  onSelect,
}: {
  active: TimeFilter;
  counts: Record<Exclude<TimeFilter, "all">, number>;
  unfinishedCounts: Record<Exclude<TimeFilter, "all">, number>;
  onSelect: (filter: TimeFilter) => void;
}) {
  const items = [
    { key: "am", label: "Morning", icon: <Sun className="h-[18px] w-[18px]" /> },
    { key: "any", label: "Anytime", icon: <Sparkles className="h-[18px] w-[18px]" /> },
    { key: "pm", label: "Evening", icon: <Moon className="h-[18px] w-[18px]" /> },
    { key: "other", label: "Other", icon: <CircleDashed className="h-[18px] w-[18px]" /> },
  ] as const;
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  return (
    <div className="mb-6 flex items-center justify-center gap-3 text-muted-foreground">
      <button
        type="button"
        title={`All tasks: ${total}`}
        aria-label={`All tasks: ${total}`}
        aria-pressed={active === "all"}
        onClick={() => onSelect("all")}
        className={`flex h-9 min-w-12 items-center justify-center rounded-full px-3 text-xs font-black transition-colors ${
          active === "all"
            ? "bg-primary text-primary-foreground shadow-md"
            : "bg-card text-foreground hover:bg-muted"
        }`}
      >
        All
      </button>
      {items.map((item) => {
        const count = counts[item.key];
        const unfinishedCount = unfinishedCounts[item.key];
        const selected = active === item.key;
        return (
          <button
            type="button"
            key={item.key}
            title={`${item.label}: ${count}`}
            aria-label={`${item.label}: ${count}`}
            aria-pressed={selected}
            onClick={() => onSelect(item.key)}
            className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              selected
                ? "bg-primary text-primary-foreground shadow-md"
                : count > 0
                  ? "text-foreground hover:bg-muted"
                  : "text-muted-foreground/35 hover:bg-muted"
            }`}
          >
            {item.icon}
            {unfinishedCount > 0 && !selected && (
              <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function countUnfinished(tasks: TodayTask[]) {
  return tasks.filter((t) => !t.completion?.done).length;
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
    <section className="mb-6 animate-fade-up" aria-label={title}>
      <h2 className="mb-3 flex items-center justify-center gap-2 text-m font-bold text-muted-foreground">
        {/* <span className="text-primary" aria-hidden>
          {icon}
        </span> */}
        <span className="text-primary" aria-hidden>
          {title}
        </span>
        <span className="sr-only">{title}</span>
        {/* <span aria-hidden>{tasks.length}</span> */}
      </h2>
      <ul className="space-y-2">
        {tasks.map(({ task, variant, completion }) => {
          const steps = (variant.steps as string[]) ?? [];
          const done = (completion?.completed_steps as string[] | null) ?? [];
          const isDone = !!completion?.done;
          const isOpen = openTask === task.id;
          const fillColor = colorValue(task.color);
          const ratio = steps.length === 0 ? (isDone ? 1 : 0) : done.length / steps.length;
          const fillWidth = Math.min(100, Math.max(0, Math.round(ratio * 100)));
          return (
            <li
              key={task.id}
              className="habit-pill relative overflow-hidden border border-border bg-card/85 transition-transform active:scale-[0.985]"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 opacity-60 transition-all duration-500 ease-out"
                style={{
                  backgroundColor: fillColor,
                  width: `${fillWidth}%`,
                }}
              />
              <button
                type="button"
                onClick={() => setOpenTask(isOpen ? null : task.id)}
                className="relative flex min-h-20 w-full items-center gap-3 px-3 py-3 text-left"
              >
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.15rem] text-xl font-bold text-white shadow-sm transition-transform ${isOpen ? "scale-105" : ""}`}
                  style={{ backgroundColor: fillColor }}
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
                    className={`block truncate text-base font-extrabold text-foreground ${isDone ? "line-through decoration-foreground/50" : ""}`}
                  >
                    {task.name}
                  </span>
                  <span className="mt-1 inline-flex max-w-full rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-black uppercase text-foreground/75 ring-1 ring-border/60 backdrop-blur-sm">
                    {steps.length ? `${done.length} / ${steps.length}` : variant.label}
                  </span>
                </span>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background/75 text-foreground/70 ring-1 ring-border/50 backdrop-blur-sm">
                  {isDone ? (
                    <Check className="h-5 w-5 animate-check" strokeWidth={2.5} />
                  ) : isOpen ? (
                    <ChevronDown className="h-5 w-5 rotate-180 transition-transform" />
                  ) : (
                    <Plus className="h-5 w-5" />
                  )}
                </span>
              </button>
              {isOpen && (
                <ul className="relative mx-3 mb-3 rounded-[1.15rem] border border-white/30 bg-card/90 px-2 py-2 shadow-sm backdrop-blur animate-fade-up">
                  {steps.map((step) => {
                    const checked = done.includes(step);
                    return (
                      <li key={step}>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onToggle(task.id, step, steps)}
                          className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors hover:bg-muted/60 disabled:opacity-50"
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
                    <li className="px-2.5 py-1.5 text-[11px] text-muted-foreground">Locked</li>
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
