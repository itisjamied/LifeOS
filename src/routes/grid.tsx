import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchAllRoutine, fetchProfile, type FullTask } from "@/lib/routine-data";
import { cycleDayFor } from "@/lib/cycle";
import { glyphFor, colorValue } from "@/lib/symbols";
import { parseISO } from "date-fns";
import { Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/grid")({
  head: () => ({
    meta: [
      { title: "Cycle grid — your 28 days" },
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
    <div className="px-3 pt-10 pb-6 animate-fade-up">
      <header className="mb-5 flex items-start justify-between px-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Overview
          </p>
          <h1 className="mt-1 text-4xl text-foreground">Cycle</h1>
          <p className="mt-1 text-sm text-muted-foreground">28 days · scroll →</p>
        </div>
        <ThemeToggle />
      </header>

      <div className="surface overflow-x-auto">
        <table className="border-separate border-spacing-0 text-xs lg:mx-auto py-5">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-semibold text-muted-foreground" />
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <th
                  key={d}
                  className={`min-w-[28px] px-1 py-2 text-center text-[11px] font-semibold ${
                    d === today ? "text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${
                      d === today ? "bg-primary" : ""
                    }`}
                  >
                    {d}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {routine.map((ft) => (
              <tr key={ft.task.id}>
                <th className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-2 text-left text-sm font-semibold text-foreground">
                  <span
                    className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                    style={{ backgroundColor: colorValue(ft.task.color) }}
                  />
                  {ft.task.name}
                </th>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => {
                  const sched = ft.schedule.find((s) => s.cycle_day === d);
                  const variant = sched?.variant_id
                    ? ft.variants.find((v) => v.id === sched.variant_id)
                    : null;
                  const isToday = d === today;
                  return (
                    <td
                      key={d}
                      className={`min-w-[28px] border-t border-border px-1 py-1.5 text-center align-middle ${
                        isToday ? "bg-primary/8" : ""
                      }`}
                    >
                      {variant ? (
                        <span
                          className="text-sm font-semibold leading-none"
                          style={{ color: colorValue(ft.task.color) }}
                          aria-label={variant.label}
                        >
                          {glyphFor(variant.symbol)}
                        </span>
                      ) : (
                        <span className="text-border">·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
