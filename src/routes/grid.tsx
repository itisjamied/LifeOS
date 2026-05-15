import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchAllRoutine, fetchProfile, type FullTask } from "@/lib/routine-data";
import { cycleDayFor } from "@/lib/cycle";
import { glyphFor, colorValue } from "@/lib/symbols";
import { parseISO } from "date-fns";
import { CalendarDays, ChevronLeft, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/grid")({
  head: () => ({
    meta: [
      { title: "Cycle calendar — Cycle" },
      { name: "description", content: "See the whole 28-day routine at a glance." },
    ],
  }),
  component: GridPage,
});

function GridPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [routine, setRoutine] = useState<FullTask[] | null>(null);
  const [cycleStart, setCycleStart] = useState<Date | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [data, profile] = await Promise.all([fetchAllRoutine(user.id), fetchProfile(user.id)]);
      setRoutine(data);
      setCycleStart(profile?.cycle_start_date ? parseISO(profile.cycle_start_date) : new Date());
    })();
  }, [user]);

  const today = useMemo(
    () => (cycleStart ? cycleDayFor(new Date(), cycleStart) : null),
    [cycleStart],
  );

  if (!routine) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Sparkles className="mr-2 h-4 w-4 animate-pulse" /> loading…
      </div>
    );
  }

  return (
    <div className="px-4 pt-8 pb-6 animate-fade-up">
      <header className="mb-6">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <Link to="/" className="icon-button" aria-label="Back to Today" title="Back to Today">
            <ChevronLeft className="h-[18px] w-[18px]" />
          </Link>
          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">28 days</p>
            <h1 className="mt-1 text-3xl text-foreground">Calendar</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="surface overflow-hidden p-3">
        <div className="mb-3 flex items-center justify-center gap-2 text-muted-foreground">
          <CalendarDays className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold text-foreground">Day {today ?? 1}</span>
          <span className="text-xs">/ 28</span>
        </div>

        <div className="overflow-x-auto pb-2">
          <div
            className="grid min-w-max items-center gap-x-1.5 gap-y-2 text-xs"
            style={{ gridTemplateColumns: "10.5rem repeat(28, 2rem)" }}
          >
            <div className="sticky left-0 z-20 h-8 rounded-full bg-card/95 backdrop-blur" />
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <span
                key={d}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-black ${
                  d === today
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-muted/60 text-muted-foreground"
                }`}
                aria-label={`Day ${d}`}
              >
                {d}
              </span>
            ))}

            {routine.map((ft) => (
              <div key={ft.task.id} className="contents">
                <Link
                  to="/habit/$taskId"
                  params={{ taskId: ft.task.id }}
                  title={ft.task.name}
                  aria-label={ft.task.name}
                  className="sticky left-0 z-20 flex h-10 w-[10.5rem] items-center gap-2 rounded-full bg-card/95 px-2 text-left font-bold text-foreground shadow-sm backdrop-blur"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black text-white shadow-sm"
                    style={{ backgroundColor: colorValue(ft.task.color) }}
                    aria-hidden
                  >
                    {glyphFor(ft.variants[0]?.symbol)}
                  </span>
                  <span className="truncate">{ft.task.name}</span>
                </Link>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => {
                  const sched = ft.schedule.find((s) => s.cycle_day === d);
                  const variant = sched?.variant_id
                    ? ft.variants.find((v) => v.id === sched.variant_id)
                    : null;
                  const isToday = d === today;
                  return (
                    <span
                      key={d}
                      title={`${ft.task.name}, day ${d}${variant ? `: ${variant.label}` : ""}`}
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        isToday ? "bg-primary/10 ring-2 ring-primary/30" : ""
                      }`}
                    >
                      {variant ? (
                        <span
                          className="flex h-[1.625rem] w-[1.625rem] items-center justify-center rounded-full text-[11px] font-black leading-none text-white shadow-sm"
                          style={{ backgroundColor: colorValue(ft.task.color) }}
                          aria-label={variant.label}
                        >
                          {glyphFor(variant.symbol)}
                        </span>
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/20" />
                      )}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
