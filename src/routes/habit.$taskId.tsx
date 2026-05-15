import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchAllRoutine, fetchProfile, type FullTask } from "@/lib/routine-data";
import {
  fetchHabitHistory,
  computeStreakRuns,
  type DayEntry,
  type StreakRun,
} from "@/lib/habit-detail";
import {
  addDays,
  differenceInCalendarDays,
  isAfter,
  isToday,
  parseISO,
  format,
  startOfDay,
} from "date-fns";
import { ChevronLeft, Flame, Sparkles, Trophy } from "lucide-react";
import { colorValue, glyphFor } from "@/lib/symbols";

const HABIT_DETAIL_WINDOW_DAYS = 28;

export const Route = createFileRoute("/habit/$taskId")({
  head: () => ({
    meta: [
      { title: "Habit detail — Cycle" },
      { name: "description", content: "28-day calendar and streak breakdown for a habit." },
    ],
  }),
  component: HabitDetailPage,
});

function HabitDetailPage() {
  const { taskId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [ft, setFt] = useState<FullTask | null>(null);
  const [entries, setEntries] = useState<DayEntry[] | null>(null);
  const [runs, setRuns] = useState<StreakRun[]>([]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [routine, profile] = await Promise.all([
        fetchAllRoutine(user.id),
        fetchProfile(user.id),
      ]);
      const found = routine.find((r) => r.task.id === taskId) ?? null;
      setFt(found);
      if (found) {
        const cs = profile?.cycle_start_date ? parseISO(profile.cycle_start_date) : new Date();
        const calendarStart = currentCycleStartFor(cs);
        const e = await fetchHabitHistory(
          user.id,
          found,
          cs,
          HABIT_DETAIL_WINDOW_DAYS,
          calendarStart,
        );
        const measuredEntries = e.filter(isMeasuredEntry);
        setEntries(e);
        setRuns(computeStreakRuns(measuredEntries));
      }
    })();
  }, [user, taskId]);

  if (!ft || !entries) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Sparkles className="mr-2 h-4 w-4 animate-pulse" /> loading…
      </div>
    );
  }

  const measuredEntries = entries.filter(isMeasuredEntry);
  const scheduled = measuredEntries.filter((e) => e.scheduled);
  const completed = scheduled.filter((e) => e.done);
  const consistency =
    scheduled.length === 0 ? 100 : Math.round((completed.length / scheduled.length) * 100);
  const longest = runs[0]?.length ?? 0;
  // Current streak: walk backwards from today.
  let current = 0;
  for (let i = measuredEntries.length - 1; i >= 0; i--) {
    const e = measuredEntries[i];
    if (!e.scheduled) continue;
    if (e.done) current++;
    else if (i !== measuredEntries.length - 1) break;
    else continue; // today not yet done — ignore
  }

  return (
    <div className="px-5 pt-8 pb-6 animate-fade-up">
      <Link to="/" className="icon-button" aria-label="Back to Today" title="Back to Today">
        <ChevronLeft className="h-4 w-4" />
      </Link>
      <header className="mt-4 mb-5 text-center">
        <span
          className="mx-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem] text-2xl font-black text-white shadow-md"
          style={{ backgroundColor: colorValue(ft.task.color) }}
          aria-hidden
        >
          {glyphFor(ft.variants[0]?.symbol)}
        </span>
        <h1 className="mt-3 text-3xl text-foreground">{ft.task.name}</h1>
      </header>

      <div
        className="habit-pill mb-5 overflow-hidden p-5 text-white shadow-lg"
        style={{ backgroundColor: colorValue(ft.task.color) }}
      >
        <p className="text-center text-xs font-black uppercase text-white/70">Current</p>
        <div className="mx-auto mt-3 flex h-32 w-32 items-center justify-center rounded-full border-[10px] border-white/75 bg-white/10 text-center shadow-inner">
          <p className="text-4xl font-black leading-none">
            {current}
            <span className="ml-1 text-lg">d</span>
          </p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 text-center">
          <Stat label="Best" value={`${longest}d`} icon={<Trophy className="h-3 w-3" />} light />
          <Stat label="Done" value={`${consistency}%`} icon={<Flame className="h-3 w-3" />} light />
        </div>
      </div>

      <section className="surface mb-5 p-4">
        <h2 className="mb-3 text-xs font-medium uppercase text-muted-foreground">
          28-day calendar
        </h2>
        <CalendarGrid entries={entries} taskColor={ft.task.color} />
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <Legend color={ft.task.color} label="Done" />
          <span className="inline-flex items-center gap-1">
            <span
              className="h-3 w-3 rounded-sm border opacity-35"
              style={{
                borderColor: colorValue(ft.task.color),
                backgroundColor: colorValue(ft.task.color),
              }}
            />{" "}
            Expected
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm border border-border bg-transparent" /> Off
          </span>
        </div>
      </section>

      <section className="surface p-4">
        <h2 className="mb-3 text-xs font-medium uppercase text-muted-foreground">
          Streak breakdown
        </h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed streaks yet.</p>
        ) : (
          <ul className="space-y-2">
            {runs.slice(0, 8).map((r, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm"
              >
                <span className="text-muted-foreground">
                  {format(r.start, "MMM d")} – {format(r.end, "MMM d")}
                </span>
                <span className="font-bold text-primary">{r.length}d</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function isMeasuredEntry(entry: DayEntry) {
  return !isAfter(entry.date, new Date()) && (!isToday(entry.date) || entry.done);
}

function currentCycleStartFor(cycleStart: Date) {
  const firstCycleDay = startOfDay(cycleStart);
  const today = startOfDay(new Date());
  const daysSinceStart = Math.max(0, differenceInCalendarDays(today, firstCycleDay));
  const cyclesSinceStart = Math.floor(daysSinceStart / HABIT_DETAIL_WINDOW_DAYS);
  return addDays(firstCycleDay, cyclesSinceStart * HABIT_DETAIL_WINDOW_DAYS);
}

function Stat({
  label,
  value,
  icon,
  light = false,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  light?: boolean;
}) {
  return (
    <div
      className={
        light ? "rounded-[1rem] bg-white/15 px-2 py-2 text-center" : "surface p-3 text-center"
      }
    >
      <p
        className={`flex items-center justify-center gap-1 text-[10px] uppercase ${
          light ? "text-white/70" : "text-muted-foreground"
        }`}
      >
        {icon}
        {label}
      </p>
      <p className={`mt-0.5 text-lg font-bold ${light ? "text-white" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: colorValue(color) }} />
      {label}
    </span>
  );
}

function CalendarGrid({ entries, taskColor }: { entries: DayEntry[]; taskColor: string }) {
  const habitColor = colorValue(taskColor);
  const rows: DayEntry[][] = [];
  for (let i = 0; i < entries.length; i += 7) rows.push(entries.slice(i, i + 7));

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[9px] uppercase text-muted-foreground">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row[0]?.iso} className="grid grid-cols-7 gap-1">
            {row.map((e) => {
              const status = e.scheduled
                ? e.done
                  ? "Done"
                  : isAfter(e.date, new Date())
                    ? "Expected"
                    : "Missed"
                : "Off";
              const title = `${format(e.date, "MMM d")} — ${status}`;
              if (!e.scheduled) {
                return (
                  <span
                    key={e.iso}
                    title={title}
                    className="aspect-square rounded-sm border border-border bg-transparent"
                  />
                );
              }
              if (e.done) {
                return (
                  <span
                    key={e.iso}
                    title={title}
                    className="aspect-square rounded-sm border border-transparent"
                    style={{ backgroundColor: habitColor }}
                  />
                );
              }
              return (
                <span
                  key={e.iso}
                  title={title}
                  className="aspect-square rounded-sm border opacity-35"
                  style={{ borderColor: habitColor, backgroundColor: habitColor }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
