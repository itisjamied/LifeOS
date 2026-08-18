import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  fetchAllRoutine,
  fetchCompletionsForDate,
  fetchProfile,
  type CompletionRow,
  type FullTask,
} from "@/lib/routine-data";
import { fetchWeeklyGoals, WEEK_DAY_KEYS, type GoalItem, type WeekDayKey } from "@/lib/goals-data";
import { supabase } from "@/integrations/supabase/client";
import { scheduleDayFor, todayISO } from "@/lib/schedule";
import { ThemeToggle } from "@/components/theme-toggle";
import { format, parseISO, startOfWeek } from "date-fns";
import { ArrowRight, BookOpen, Check, ListChecks, Settings, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";

type ScoreSlice = {
  key: "habits" | "journal" | "goals";
  label: string;
  value: number;
  done: number;
  total: number;
  color: string;
  href: "/" | "/today" | "/journal" | "/goals";
  action: string;
  detail: string;
  icon: React.ReactNode;
};

type DailyScore = {
  score: number;
  dateLabel: string;
  slices: ScoreSlice[];
  bestAction: ScoreSlice;
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home - LifeOS" },
      {
        name: "description",
        content: "Your daily LifeOS score across routines, goals, and journaling.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DailyScore | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      setBusy(true);
      try {
        const today = new Date();
        const todayKey = todayISO(today);
        const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
        const [{ routine, completions, profile }, journalPages, weeklyGoals] = await Promise.all([
          fetchRoutineState(user.id, today, todayKey),
          fetchJournalPagesForDate(user.id, todayKey),
          fetchWeeklyGoals(user.id, weekStart),
        ]);

        if (cancelled) return;

        const habitProgress = routineProgress(routine, completions, profile, today);
        const journalProgress = journalPages.some(hasJournalContent) ? 1 : 0;
        const todaysGoals = weeklyGoals.dailyGoals[weekDayKey(today)];
        const goalProgress = goalsProgress(todaysGoals);
        const slices: ScoreSlice[] = [
          {
            key: "habits",
            label: "Habits",
            value: habitProgress.percent,
            done: habitProgress.done,
            total: habitProgress.total,
            color: "var(--routine-oral)",
            href: "/today",
            action: habitProgress.total === 0 ? "View routines" : "Complete habits",
            detail:
              habitProgress.total === 0
                ? "No habits scheduled"
                : `${habitProgress.done}/${habitProgress.total} complete`,
            icon: <ListChecks className="h-4 w-4" />,
          },
          {
            key: "journal",
            label: "Journal",
            value: journalProgress * 100,
            done: journalProgress,
            total: 1,
            color: "var(--routine-makeup)",
            href: "/journal",
            action: journalProgress ? "Open journal" : "Write entry",
            detail: journalProgress ? "Entry found" : "No entry yet",
            icon: <BookOpen className="h-4 w-4" />,
          },
          {
            key: "goals",
            label: "Goals",
            value: goalProgress.percent,
            done: goalProgress.done,
            total: goalProgress.total,
            color: "var(--routine-skin-pm)",
            href: "/goals",
            action: goalProgress.done >= goalProgress.total ? "Review goals" : "Check goals",
            detail: `${goalProgress.done}/${goalProgress.total} checked`,
            icon: <Target className="h-4 w-4" />,
          },
        ];
        const score = Math.round(
          slices.reduce((total, slice) => total + slice.value, 0) / slices.length,
        );

        setSummary({
          score,
          dateLabel: format(today, "EEEE, MMM d"),
          slices,
          bestAction: [...slices].sort((a, b) => a.value - b.value)[0],
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load today");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || busy || !summary) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Sparkles className="mr-2 h-4 w-4 animate-pulse" /> loading LifeOS...
      </div>
    );
  }

  return (
    <div className="px-5 pt-8 animate-fade-up">
      <header className="mb-6">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <div className="h-full flex flex-col justify-center">
            <Link to="/settings" className="icon-button" aria-label="Settings" title="Settings">
              <Settings className="h-[18px] w-[18px]" />
            </Link>
          </div>
          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">
              {summary.dateLabel}
            </p>
            <h1 className="mt-1 text-3xl text-foreground">LifeOS</h1>
          </div>
          <div className="flex h-full items-center justify-end">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <section className="surface p-5">
        <div className="flex flex-col items-center gap-5 lg:flex-row lg:justify-center">
          <ScoreRings score={summary.score} slices={summary.slices} />
          <div className="w-full max-w-sm space-y-3">
            <p className="text-xs font-black uppercase text-muted-foreground">Daily score</p>
            <h2 className="text-2xl text-foreground">{scoreMessage(summary.score)}</h2>
            <p className="text-sm text-muted-foreground">
              {summary.bestAction.value >= 100
                ? "Everything is closed out for today."
                : `${summary.bestAction.label} is the next area to move.`}
            </p>
            <Link
              to={summary.bestAction.href}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground shadow transition-transform active:scale-95"
            >
              {summary.bestAction.action}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-3 lg:grid-cols-3">
        {summary.slices.map((slice) => (
          <ScoreCard key={slice.key} slice={slice} />
        ))}
      </section>
    </div>
  );
}

async function fetchRoutineState(userId: string, today: Date, todayKey: string) {
  const [routine, completions, profile] = await Promise.all([
    fetchAllRoutine(userId),
    fetchCompletionsForDate(userId, todayKey),
    fetchProfile(userId),
  ]);
  return { routine, completions, profile, today };
}

async function fetchJournalPagesForDate(userId: string, date: string) {
  const { data, error } = await supabase
    .from("journal_note_pages")
    .select("id, heading, content_text")
    .eq("user_id", userId)
    .eq("entry_date", date);

  if (error) throw error;
  return data ?? [];
}

function routineProgress(
  routine: FullTask[],
  completions: CompletionRow[],
  profile: Awaited<ReturnType<typeof fetchProfile>>,
  today: Date,
) {
  const start = profile?.routine_start_date ? parseISO(profile.routine_start_date) : today;
  const slot = scheduleDayFor(today, start);
  const scheduled = routine.flatMap((full) => {
    const scheduledSlot = full.schedule.find((entry) => entry.schedule_slot === slot);
    if (!scheduledSlot?.variant_id) return [];
    return [full.task.id];
  });
  const done = scheduled.filter(
    (taskId) => completions.find((completion) => completion.task_id === taskId)?.done,
  ).length;
  return {
    done,
    total: scheduled.length,
    percent: scheduled.length === 0 ? 100 : Math.round((done / scheduled.length) * 100),
  };
}

function goalsProgress(items: GoalItem[]) {
  const total = Math.max(3, items.length);
  const done = items.filter((item) => item.done && item.text.trim().length > 0).length;
  return {
    done,
    total,
    percent: Math.round((done / total) * 100),
  };
}

function hasJournalContent(page: { heading: string | null; content_text: string | null }) {
  return [page.heading, page.content_text].some((value) => (value ?? "").trim().length > 0);
}

function weekDayKey(date: Date): WeekDayKey {
  return WEEK_DAY_KEYS[(date.getDay() + 6) % 7];
}

function scoreMessage(score: number) {
  if (score >= 95) return "Today is complete";
  if (score >= 70) return "Nearly there";
  if (score >= 40) return "In progress";
  return "Start with one thing";
}

function ScoreRings({ score, slices }: { score: number; slices: ScoreSlice[] }) {
  const rings = slices.map((slice, index) => ({
    ...slice,
    radius: 88 - index * 18,
  }));

  return (
    <div className="relative flex h-64 w-64 shrink-0 items-center justify-center">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 220 220" aria-hidden>
        {rings.map((ring) => {
          const circumference = 2 * Math.PI * ring.radius;
          return (
            <g key={ring.key}>
              <circle
                cx="110"
                cy="110"
                r={ring.radius}
                fill="none"
                stroke="var(--muted)"
                strokeWidth="11"
              />
              <circle
                cx="110"
                cy="110"
                r={ring.radius}
                fill="none"
                stroke={ring.color}
                strokeWidth="11"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - ring.value / 100)}
                className="transition-all duration-700 ease-out"
              />
            </g>
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-[11px] font-black uppercase text-muted-foreground">Score</p>
        <p className="text-5xl font-black text-foreground">{score}</p>
        <p className="text-xs font-bold text-muted-foreground">/ 100</p>
      </div>
    </div>
  );
}

function ScoreCard({ slice }: { slice: ScoreSlice }) {
  const complete = slice.value >= 100;
  return (
    <article className="surface overflow-hidden p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm"
            style={{ backgroundColor: slice.color }}
            aria-hidden
          >
            {complete ? <Check className="h-4 w-4" strokeWidth={3} /> : slice.icon}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-foreground">{slice.label}</h2>
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">{slice.detail}</p>
          </div>
        </div>
        <p className="shrink-0 text-lg font-black text-foreground">{slice.value}%</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${slice.value}%`, backgroundColor: slice.color }}
        />
      </div>
      <Link
        to={slice.href}
        className="mt-4 flex h-10 items-center justify-center gap-2 rounded-full border border-border bg-background/70 px-3 text-sm font-bold text-foreground transition-colors hover:bg-muted"
      >
        {slice.action}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </article>
  );
}
