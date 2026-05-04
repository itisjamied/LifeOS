import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchAllRoutine, fetchProfile, type FullTask } from "@/lib/routine-data";
import { computeStats, type TaskStats } from "@/lib/streaks";
import { parseISO } from "date-fns";
import { Flame, Sparkles, Trophy, ArrowUpDown } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { colorValue } from "@/lib/symbols";

export const Route = createFileRoute("/stats")({
  head: () => ({
    meta: [
      { title: "Stats — Cycle" },
      { name: "description", content: "Your habit streaks and consistency over the last 90 days." },
    ],
  }),
  component: StatsPage,
});

type SortKey = "streak" | "consistency" | "best" | "name";
type TimeFilter = "all" | "am" | "pm" | "any" | "other";

function StatsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<TaskStats[] | null>(null);
  const [routine, setRoutine] = useState<FullTask[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("streak");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [rt, profile] = await Promise.all([fetchAllRoutine(user.id), fetchProfile(user.id)]);
      setRoutine(rt);
      const cs = profile?.cycle_start_date ? parseISO(profile.cycle_start_date) : new Date();
      const s = await computeStats(user.id, rt as FullTask[], cs);
      setStats(s);
    })();
  }, [user]);

  const timeOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const ft of routine) m.set(ft.task.id, ft.task.time_of_day ?? "any");
    return m;
  }, [routine]);

  const visible = useMemo(() => {
    if (!stats) return null;
    let list = stats;
    if (timeFilter !== "all") {
      list = list.filter((s) => (timeOf.get(s.taskId) ?? "any") === timeFilter);
    }
    const sorted = [...list].sort((a, b) => {
      switch (sortKey) {
        case "consistency":
          return b.consistencyPct - a.consistencyPct;
        case "best":
          return b.longestStreak - a.longestStreak;
        case "name":
          return a.name.localeCompare(b.name);
        case "streak":
        default:
          return b.currentStreak - a.currentStreak;
      }
    });
    return sorted;
  }, [stats, sortKey, timeFilter, timeOf]);

  if (!visible || !stats) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Sparkles className="mr-2 h-4 w-4 animate-pulse" /> loading stats…
      </div>
    );
  }

  const topStreak = [...stats].sort((a, b) => b.currentStreak - a.currentStreak)[0];

  return (
    <div className="px-5 pt-10 pb-6 animate-fade-up">
      <header className="mb-7 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Last 90 days
          </p>
          <h1 className="mt-1 text-4xl text-foreground">Stats</h1>
          <p className="mt-1 text-sm text-muted-foreground">Streaks &amp; consistency per habit.</p>
        </div>
        <ThemeToggle />
      </header>

      {topStreak && topStreak.currentStreak > 0 && (
        <div className="surface mb-5 flex items-center gap-3 p-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Flame className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Hottest streak</p>
            <p className="truncate text-base font-semibold text-foreground">{topStreak.name}</p>
          </div>
          <p className="text-2xl font-bold text-primary">{topStreak.currentStreak}d</p>
        </div>
      )}

      {/* Filter & sort controls */}
      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {(["all", "am", "pm", "any", "other"] as TimeFilter[]).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeFilter(tf)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                timeFilter === tf
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {tf === "all" ? "All" : tf.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Sort</span>
          {(
            [
              { k: "streak", label: "Streak" },
              { k: "consistency", label: "Consistency" },
              { k: "best", label: "Best" },
              { k: "name", label: "Name" },
            ] as { k: SortKey; label: string }[]
          ).map((opt) => (
            <button
              key={opt.k}
              onClick={() => setSortKey(opt.k)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                sortKey === opt.k
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-2">
        {visible.map((s) => (
          <li key={s.taskId}>
            <Link
              to="/habit/$taskId"
              params={{ taskId: s.taskId }}
              className="surface block p-4 transition-transform hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: colorValue(s.color) }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
                  {s.name}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                  <Flame className="h-3 w-3" />
                  {s.currentStreak}d
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="Current" value={`${s.currentStreak}d`} />
                <Stat
                  label="Best"
                  value={`${s.longestStreak}d`}
                  icon={<Trophy className="h-3 w-3" />}
                />
                <Stat label="Consistency" value={`${s.consistencyPct}%`} />
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${s.consistencyPct}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {s.completedCount} / {s.scheduledCount} scheduled days completed
              </p>
            </Link>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="surface p-8 text-center text-sm text-muted-foreground">
            No habits match this filter.
          </li>
        )}
      </ul>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-1.5">
      <p className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}
