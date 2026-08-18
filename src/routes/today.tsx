import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAllRoutine,
  fetchCompletionsForDate,
  fetchProfile,
  type FullTask,
  type CompletionRow,
} from "@/lib/routine-data";
import { scheduleDayFor } from "@/lib/schedule";
import { glyphFor, colorValue } from "@/lib/symbols";
import { format, parseISO, addDays, subDays, isToday as isTodayFn, isSameDay } from "date-fns";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CircleDashed,
  Ban,
  Flame,
  Plus,
  Pencil,
  Sparkles,
  Sun,
  Moon,
  CheckCheck,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { PageHeader } from "@/components/page-header";
import { toast } from "sonner";

type TodayTask = {
  task: FullTask["task"];
  variant: FullTask["variants"][number];
  completion?: CompletionRow;
};

type TimeFilter = "all" | "am" | "any" | "pm" | "other";

export const Route = createFileRoute("/today")({
  head: () => ({
    meta: [
      { title: "Routines - LifeOS" },
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
  const [scheduleStart, setScheduleStart] = useState<Date | null>(null);
  const [busy, setBusy] = useState(true);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const actionLockRef = useRef(new Set<string>());
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
        setScheduleStart(
          profile?.routine_start_date ? parseISO(profile.routine_start_date) : new Date(),
        );
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
    () => (scheduleStart ? scheduleDayFor(viewDate, scheduleStart) : 1),
    [scheduleStart, viewDate],
  );
  const isViewingToday = isTodayFn(viewDate);
  const isFuture = viewDate.getTime() > new Date().setHours(23, 59, 59, 999);

  const todaysTasks = useMemo(() => {
    if (!routine) return [];
    return routine.flatMap((ft): TodayTask[] => {
      const sched = ft.schedule.find((s) => s.schedule_slot === day);
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

  async function saveCompletionState({
    taskId,
    completedSteps,
    done,
    skipped,
  }: {
    taskId: string;
    completedSteps: string[];
    done: boolean;
    skipped: boolean;
  }) {
    if (!user || isFuture) return false;
    const existing = completions.find((c) => c.task_id === taskId);
    const wasDone = !!existing?.done;
    const restorePreviousCompletion = () => {
      setCompletions((prev) => {
        const without = prev.filter((c) => c.task_id !== taskId);
        return existing ? [...without, existing] : without;
      });
    };

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
        completed_steps: completedSteps,
        done,
        skipped,
        completed_at: done ? new Date().toISOString() : null,
      };
      return [...without, row];
    });

    const payload = {
      user_id: user.id,
      task_id: taskId,
      date: viewDateStr,
      completed_steps: completedSteps,
      done,
      skipped,
      completed_at: done ? new Date().toISOString() : null,
    };

    const { data, error } = await supabase
      .from("completions")
      .upsert(payload, { onConflict: "user_id,task_id,date" })
      .select()
      .single();
    if (error) {
      if (isMissingSkippedColumnError(error) && !skipped) {
        const { skipped: _skipped, ...fallbackPayload } = payload;
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("completions")
          .upsert(fallbackPayload, { onConflict: "user_id,task_id,date" })
          .select()
          .single();

        if (!fallbackError && fallbackData) {
          setCompletions((prev) =>
            prev.map((c) =>
              c.task_id === taskId ? ({ ...fallbackData, skipped: false } as CompletionRow) : c,
            ),
          );
          return true;
        }
      }

      restorePreviousCompletion();
      if (isMissingSkippedColumnError(error) && skipped) {
        toast.error("Apply the latest Supabase migration before using Skip today");
        return false;
      }

      toast.error("Couldn't save");
      return false;
    } else if (data) {
      setCompletions((prev) => prev.map((c) => (c.task_id === taskId ? data : c)));
    }
    return true;
  }

  async function toggleStep(taskId: string, step: string, allSteps: string[]) {
    const existing = completions.find((c) => c.task_id === taskId);
    const current = existing?.skipped ? [] : ((existing?.completed_steps as string[] | null) ?? []);
    const next = current.includes(step) ? current.filter((s) => s !== step) : [...current, step];
    const done = allSteps.length > 0 && next.length >= allSteps.length;
    await saveCompletionState({ taskId, completedSteps: next, done, skipped: false });
  }

  async function toggleTaskDone(taskId: string, allSteps: string[], done: boolean) {
    const lockKey = `${taskId}:${viewDateStr}:${done ? "done" : "clear"}`;
    if (actionLockRef.current.has(lockKey)) return;
    actionLockRef.current.add(lockKey);

    try {
      const saved = await saveCompletionState({
        taskId,
        completedSteps: done ? allSteps : [],
        done,
        skipped: false,
      });
      if (saved) {
        toast.success(done ? "Habit complete" : "Habit cleared", {
          id: `habit-${taskId}-${viewDateStr}`,
        });
      }
    } finally {
      window.setTimeout(() => {
        actionLockRef.current.delete(lockKey);
      }, 500);
    }
  }

  async function toggleSkipTask(taskId: string) {
    const skipped = !completions.find((c) => c.task_id === taskId)?.skipped;
    const lockKey = `${taskId}:${viewDateStr}:${skipped ? "skip" : "unskip"}`;
    if (actionLockRef.current.has(lockKey)) return;
    actionLockRef.current.add(lockKey);

    try {
      const saved = await saveCompletionState({ taskId, completedSteps: [], done: false, skipped });
      if (saved) {
        toast.success(skipped ? "Skipped for today" : "Back on today's list", {
          id: `habit-${taskId}-${viewDateStr}`,
        });
      }
    } finally {
      window.setTimeout(() => {
        actionLockRef.current.delete(lockKey);
      }, 500);
    }
  }

  if (loading || busy) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Sparkles className="mr-2 h-4 w-4 animate-pulse" /> loading LifeOS...
      </div>
    );
  }

  return (
    <div className="px-5 pt-8 animate-fade-up">
      <PageHeader
        eyebrow={format(viewDate, "EEEE, MMM d")}
        title={isViewingToday ? "Today" : format(viewDate, "MMM d")}
        actions={<ThemeToggle />}
      />

      <div className="mb-4 flex items-center justify-start gap-2">
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
          className="inline-flex h-10 min-w-24 items-center justify-center gap-2 rounded-full border border-border bg-card/80 px-4 text-sm font-bold text-foreground shadow-sm transition-transform active:scale-95 disabled:opacity-100"
          aria-label={`Schedule day ${day}`}
        >
          <span className="pop-dot inline-block h-2 w-2 rounded-full bg-primary" />
          Day {day}
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
        <EmptyRoutineState title="Nothing scheduled" detail={`Day ${day} is clear.`} />
      ) : visibleTaskCount === 0 ? (
        <EmptyRoutineState
          title="No habits here"
          detail={`Day ${day} has no ${timeFilterLabel(timeFilter).toLowerCase()} habits.`}
        />
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
              onToggleTaskDone={toggleTaskDone}
              onSkipTask={toggleSkipTask}
              onOpenDetails={(taskId) => navigate({ to: "/habit/$taskId", params: { taskId } })}
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
              onToggleTaskDone={toggleTaskDone}
              onSkipTask={toggleSkipTask}
              onOpenDetails={(taskId) => navigate({ to: "/habit/$taskId", params: { taskId } })}
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
              onToggleTaskDone={toggleTaskDone}
              onSkipTask={toggleSkipTask}
              onOpenDetails={(taskId) => navigate({ to: "/habit/$taskId", params: { taskId } })}
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
              onToggleTaskDone={toggleTaskDone}
              onSkipTask={toggleSkipTask}
              onOpenDetails={(taskId) => navigate({ to: "/habit/$taskId", params: { taskId } })}
              disabled={isFuture}
            />
          )}
        </>
      )}

      <RoutineTools />
    </div>
  );
}

function RoutineTools() {
  const tools = [
    {
      to: "/grid",
      label: "Calendar",
      icon: <CalendarDays className="h-4 w-4" />,
    },
    {
      to: "/stats",
      label: "Progress",
      icon: <Flame className="h-4 w-4" />,
    },
    {
      to: "/manage",
      label: "Edit",
      icon: <Pencil className="h-4 w-4" />,
    },
  ] as const;

  return (
    <nav className="mb-6 flex items-center gap-2" aria-label="Routine tools">
      {tools.map((tool) => (
        <Link
          key={tool.to}
          to={tool.to}
          className="inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-card/70 px-2 text-xs font-bold text-foreground transition-colors hover:bg-muted"
        >
          <span className="text-primary" aria-hidden>
            {tool.icon}
          </span>
          <span className="truncate">{tool.label}</span>
        </Link>
      ))}
    </nav>
  );
}

function EmptyRoutineState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="surface p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] bg-primary/10 text-primary">
          <CalendarDays className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-foreground">{title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
        </div>
        <Link
          to="/manage"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Link>
      </div>
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
    <div className="mb-6 flex items-center justify-start gap-2 overflow-x-auto pb-1 text-muted-foreground">
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
  return tasks.filter((t) => !t.completion?.done && !t.completion?.skipped).length;
}

function timeFilterLabel(filter: TimeFilter) {
  switch (filter) {
    case "am":
      return "Morning";
    case "any":
      return "Anytime";
    case "pm":
      return "Evening";
    case "other":
      return "Other";
    case "all":
    default:
      return "All";
  }
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

function Section({
  icon,
  title,
  tasks,
  openTask,
  setOpenTask,
  onToggle,
  onToggleTaskDone,
  onSkipTask,
  onOpenDetails,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  tasks: TodayTask[];
  openTask: string | null;
  setOpenTask: (id: string | null) => void;
  onToggle: (taskId: string, step: string, all: string[]) => void;
  onToggleTaskDone: (taskId: string, allSteps: string[], done: boolean) => void;
  onSkipTask: (taskId: string) => void;
  onOpenDetails: (taskId: string) => void;
  disabled?: boolean;
}) {
  const longPressTimerRef = useRef<number | null>(null);
  const longPressedTaskRef = useRef<string | null>(null);

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = (taskId: string) => {
    if (disabled) return;
    clearLongPress();
    longPressedTaskRef.current = null;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressedTaskRef.current = taskId;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(10);
      onOpenDetails(taskId);
    }, 550);
  };

  useEffect(
    () => () => {
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    },
    [],
  );

  if (tasks.length === 0) return null;
  return (
    <section className="mb-6 animate-fade-up" aria-label={title}>
      <h2 className="mb-3 flex items-center gap-2 px-1 text-xs font-bold uppercase text-muted-foreground">
        <span className="text-primary" aria-hidden>
          {icon}
        </span>
        <span className="text-foreground" aria-hidden>
          {title}
        </span>
        <span className="sr-only">{title}</span>
        <span className="ml-auto text-muted-foreground" aria-hidden>
          {tasks.length}
        </span>
      </h2>
      <ul className="space-y-2">
        {tasks.map(({ task, variant, completion }) => {
          const steps = (variant.steps as string[]) ?? [];
          const done = (completion?.completed_steps as string[] | null) ?? [];
          const isDone = !!completion?.done;
          const isSkipped = !!completion?.skipped;
          const isOpen = openTask === task.id;
          const fillColor = colorValue(task.color);
          const ratio = isSkipped
            ? 0
            : steps.length === 0
              ? isDone
                ? 1
                : 0
              : done.length / steps.length;
          const fillWidth = Math.min(100, Math.max(0, Math.round(ratio * 100)));
          const statusLabel = isSkipped
            ? "Skipped"
            : steps.length
              ? `${done.length} / ${steps.length}`
              : variant.label;
          return (
            <li
              key={task.id}
              className={`habit-pill relative overflow-hidden border border-border bg-card/85 transition-transform active:scale-[0.985] ${
                isSkipped ? "opacity-75" : ""
              }`}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 opacity-60 transition-all duration-500 ease-out"
                style={{
                  backgroundColor: isSkipped ? "var(--muted)" : fillColor,
                  width: isSkipped ? "100%" : `${fillWidth}%`,
                }}
              />
              <div className="relative flex min-h-20 items-center">
                <button
                  type="button"
                  onPointerDown={() => startLongPress(task.id)}
                  onPointerUp={clearLongPress}
                  onPointerLeave={clearLongPress}
                  onPointerCancel={clearLongPress}
                  onContextMenu={(event) => event.preventDefault()}
                  onClick={() => {
                    if (longPressedTaskRef.current === task.id) {
                      longPressedTaskRef.current = null;
                      return;
                    }
                    setOpenTask(isOpen ? null : task.id);
                  }}
                  className="flex min-h-20 min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left"
                  aria-label={`${task.name}. Tap to expand. Long press for details.`}
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.15rem] text-xl font-bold text-white shadow-sm transition-transform ${
                      isOpen ? "scale-105" : ""
                    }`}
                    style={{ backgroundColor: fillColor }}
                    aria-hidden
                  >
                    {isDone ? (
                      <Check className="h-5 w-5 animate-check" strokeWidth={3} />
                    ) : isSkipped ? (
                      <Ban className="h-5 w-5" />
                    ) : (
                      glyphFor(variant.symbol)
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-base font-extrabold text-foreground ${
                        isDone || isSkipped ? "line-through decoration-foreground/50" : ""
                      }`}
                    >
                      {task.name}
                    </span>
                    <span className="mt-1 inline-flex max-w-full rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-black uppercase text-foreground/75 ring-1 ring-border/60 backdrop-blur-sm">
                      {statusLabel}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onToggleTaskDone(task.id, steps, !isDone)}
                  className={`mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background/80 text-foreground/75 ring-1 ring-border/50 backdrop-blur-sm transition-transform active:scale-95 disabled:opacity-40 ${
                    isDone ? "text-primary" : "hover:text-primary"
                  }`}
                  aria-label={isDone ? `Clear ${task.name}` : `Complete ${task.name}`}
                  title={isDone ? "Clear habit" : "Complete habit"}
                >
                  {isDone ? (
                    <Check className="h-5 w-5 animate-check" strokeWidth={2.5} />
                  ) : (
                    <CheckCheck className="h-5 w-5" />
                  )}
                </button>
              </div>
              {isOpen && (
                <div className="relative mx-3 mb-3 rounded-[1.15rem] border border-white/30 bg-card/90 px-2 py-2 shadow-sm backdrop-blur animate-fade-up">
                  <ul>
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
                                  ? "scale-110 border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-card"
                              }`}
                            >
                              {checked && (
                                <Check className="h-3.5 w-3.5 animate-check" strokeWidth={3} />
                              )}
                            </span>
                            <span
                              className={`text-sm transition-colors ${
                                checked ? "text-muted-foreground line-through" : "text-foreground"
                              }`}
                            >
                              {step}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                    {steps.length === 0 && (
                      <li className="px-2.5 py-1.5 text-sm text-muted-foreground">
                        No sub-steps for this habit.
                      </li>
                    )}
                    {disabled && (
                      <li className="px-2.5 py-1.5 text-[11px] text-muted-foreground">Locked</li>
                    )}
                  </ul>
                  {!disabled && (
                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/70 pt-2">
                      <button
                        type="button"
                        onClick={() => onSkipTask(task.id)}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-colors ${
                          isSkipped
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Ban className="h-3.5 w-3.5" />
                        {isSkipped ? "Undo skip" : "Skip today"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenDetails(task.id)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-muted px-3 text-xs font-bold text-muted-foreground hover:text-foreground"
                      >
                        <Flame className="h-3.5 w-3.5" />
                        Details
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
