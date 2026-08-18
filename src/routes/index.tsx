import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  fetchAllRoutine,
  fetchProfile,
  type CompletionRow,
  type FullTask,
} from "@/lib/routine-data";
import { fetchWeeklyGoals, WEEK_DAY_KEYS, type GoalItem, type WeekDayKey } from "@/lib/goals-data";
import { supabase } from "@/integrations/supabase/client";
import { scheduleDayFor, todayISO } from "@/lib/schedule";
import { ThemeToggle } from "@/components/theme-toggle";
import { PageHeader } from "@/components/page-header";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { BookOpen, Check, ListChecks, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";

type ScoreSlice = {
  key: "habits" | "journal" | "goals";
  label: string;
  value: number;
  done: number;
  total: number;
  color: string;
  href: "/" | "/today" | "/journal" | "/goals";
  detail: string;
  icon: React.ReactNode;
};

type DailyScore = {
  score: number;
  dateLabel: string;
  slices: ScoreSlice[];
  weekScores: WeekScoreDay[];
};

type WeekScoreDay = {
  iso: string;
  label: string;
  dayLabel: string;
  score: number | null;
  isToday: boolean;
};

type JournalPageSummary = {
  heading: string | null;
  content_text: string | null;
  entry_date: string | null;
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
        const weekStartDate = startOfWeek(today, { weekStartsOn: 1 });
        const weekDates = Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index));
        const weekStart = todayISO(weekStartDate);
        const weekEnd = todayISO(addDays(weekStartDate, 6));
        const [{ routine, completionsByDate, profile }, journalPagesByDate, weeklyGoals] =
          await Promise.all([
            fetchRoutineWeekState(user.id, weekStart, weekEnd),
            fetchJournalPagesForDateRange(user.id, weekStart, weekEnd),
            fetchWeeklyGoals(user.id, weekStart),
          ]);

        if (cancelled) return;

        const slices = buildScoreSlices({
          routine,
          completions: completionsByDate.get(todayKey) ?? [],
          profile,
          date: today,
          journalPages: journalPagesByDate.get(todayKey) ?? [],
          dailyGoals: weeklyGoals.dailyGoals[weekDayKey(today)],
        });
        const score = scoreFromSlices(slices);
        const weekScores = weekDates.map((date) => {
          const iso = todayISO(date);
          const isFuture = iso > todayKey;
          const daySlices = isFuture
            ? null
            : buildScoreSlices({
                routine,
                completions: completionsByDate.get(iso) ?? [],
                profile,
                date,
                journalPages: journalPagesByDate.get(iso) ?? [],
                dailyGoals: weeklyGoals.dailyGoals[weekDayKey(date)],
              });

          return {
            iso,
            label: format(date, "EEE").slice(0, 1),
            dayLabel: format(date, "EEE, MMM d"),
            score: daySlices ? scoreFromSlices(daySlices) : null,
            isToday: iso === todayKey,
          };
        });

        setSummary({
          score,
          dateLabel: format(today, "EEEE, MMM d"),
          slices,
          weekScores,
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
      <PageHeader eyebrow={summary.dateLabel} title="LifeOS" actions={<ThemeToggle />} />

      <section className="surface p-5">
        <div className="flex flex-col items-center gap-5 lg:flex-row lg:justify-center">
          <ScoreRings score={summary.score} slices={summary.slices} />
          <div className="w-full max-w-sm">
            <WeeklyScoreHeatmap days={summary.weekScores} />
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

async function fetchRoutineWeekState(userId: string, weekStart: string, weekEnd: string) {
  const [routine, completions, profile] = await Promise.all([
    fetchAllRoutine(userId),
    fetchCompletionsForDateRange(userId, weekStart, weekEnd),
    fetchProfile(userId),
  ]);
  return { routine, completionsByDate: groupCompletionsByDate(completions), profile };
}

async function fetchCompletionsForDateRange(userId: string, startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from("completions")
    .select("*")
    .eq("user_id", userId)
    .gte("date", startDate)
    .lte("date", endDate);

  if (error) throw error;
  return data ?? [];
}

async function fetchJournalPagesForDateRange(userId: string, startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from("journal_note_pages")
    .select("id, heading, content_text, entry_date")
    .eq("user_id", userId)
    .gte("entry_date", startDate)
    .lte("entry_date", endDate);

  if (error) throw error;
  return groupJournalPagesByDate(data ?? []);
}

function buildScoreSlices({
  routine,
  completions,
  profile,
  date,
  journalPages,
  dailyGoals,
}: {
  routine: FullTask[];
  completions: CompletionRow[];
  profile: Awaited<ReturnType<typeof fetchProfile>>;
  date: Date;
  journalPages: JournalPageSummary[];
  dailyGoals: GoalItem[];
}) {
  const habitProgress = routineProgress(routine, completions, profile, date);
  const journalProgress = journalPages.some(hasJournalContent) ? 1 : 0;
  const goalProgress = goalsProgress(dailyGoals);

  return [
    {
      key: "habits",
      label: "Habits",
      value: habitProgress.percent,
      done: habitProgress.done,
      total: habitProgress.total,
      color: "var(--routine-oral)",
      href: "/today",
      detail:
        habitProgress.total === 0
          ? habitProgress.skipped > 0
            ? `${habitProgress.skipped} skipped`
            : "No habits scheduled"
          : `${habitProgress.done}/${habitProgress.total} complete${
              habitProgress.skipped > 0 ? `, ${habitProgress.skipped} skipped` : ""
            }`,
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
      detail: `${goalProgress.done}/${goalProgress.total} checked`,
      icon: <Target className="h-4 w-4" />,
    },
  ] satisfies ScoreSlice[];
}

function scoreFromSlices(slices: ScoreSlice[]) {
  return Math.round(slices.reduce((total, slice) => total + slice.value, 0) / slices.length);
}

function groupCompletionsByDate(completions: CompletionRow[]) {
  const byDate = new Map<string, CompletionRow[]>();
  completions.forEach((completion) => {
    const dayCompletions = byDate.get(completion.date) ?? [];
    dayCompletions.push(completion);
    byDate.set(completion.date, dayCompletions);
  });
  return byDate;
}

function groupJournalPagesByDate(pages: JournalPageSummary[]) {
  const byDate = new Map<string, JournalPageSummary[]>();
  pages.forEach((page) => {
    if (!page.entry_date) return;
    const dayPages = byDate.get(page.entry_date) ?? [];
    dayPages.push(page);
    byDate.set(page.entry_date, dayPages);
  });
  return byDate;
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
  const skipped = scheduled.filter(
    (taskId) => completions.find((completion) => completion.task_id === taskId)?.skipped,
  ).length;
  const activeScheduled = scheduled.filter(
    (taskId) => !completions.find((completion) => completion.task_id === taskId)?.skipped,
  );
  const done = activeScheduled.filter(
    (taskId) => completions.find((completion) => completion.task_id === taskId)?.done,
  ).length;
  return {
    done,
    skipped,
    total: activeScheduled.length,
    percent: activeScheduled.length === 0 ? 100 : Math.round((done / activeScheduled.length) * 100),
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

function WeeklyScoreHeatmap({ days }: { days: WeekScoreDay[] }) {
  return (
    <div>
      <div className="mb-2">
        <p className="text-[11px] font-black uppercase text-muted-foreground">This week</p>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const title =
            day.score === null
              ? `${day.dayLabel}: not scored yet`
              : `${day.dayLabel}: ${day.score}`;

          return (
            <div key={day.iso} className="min-w-0 text-center">
              <p className="mb-1 text-[10px] font-black uppercase text-muted-foreground">
                {day.label}
              </p>
              <div
                role="img"
                aria-label={title}
                title={title}
                className={`mx-auto aspect-square w-full max-w-10 rounded-md border transition-colors ${
                  day.isToday ? "ring-2 ring-primary/40" : ""
                } ${day.score === null ? "border-border bg-muted/35" : "border-transparent"}`}
                style={
                  day.score === null
                    ? undefined
                    : {
                        backgroundColor: `oklch(var(--score-heatmap) / ${heatmapOpacity(
                          day.score,
                        )})`,
                      }
                }
              />
              <p
                className={`mt-1 text-[10px] font-black leading-none ${
                  day.score === null ? "text-muted-foreground/50" : "text-foreground"
                }`}
              >
                {day.score ?? "--"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScoreCard({ slice }: { slice: ScoreSlice }) {
  const complete = slice.value >= 100;
  return (
    <Link
      to={slice.href}
      aria-label={`${slice.label}: ${slice.detail}`}
      className="surface group block overflow-hidden p-4 transition-transform active:scale-[0.99]"
    >
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
    </Link>
  );
}

function heatmapOpacity(score: number) {
  return 0.18 + (Math.max(0, Math.min(score, 100)) / 100) * 0.72;
}
