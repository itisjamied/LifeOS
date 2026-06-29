import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  fetchWeeklyGoals,
  saveWeeklyGoals,
  serializeGoalsPayload,
  WEEK_DAY_KEYS,
  type GoalItem,
  type WeekDayKey,
  type WeeklyGoalsData,
} from "@/lib/goals-data";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardList,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";
import {
  addDays,
  addWeeks,
  endOfDay,
  format,
  isSameDay,
  isWithinInterval,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/goals")({
  head: () => ({
    meta: [
      { title: "Goals — Cycle" },
      {
        name: "description",
        content: "Weekly intentions and daily goals.",
      },
    ],
  }),
  component: GoalsPage,
});

type SaveState = "idle" | "dirty" | "saving" | "saved";

const DAY_LABELS: Record<WeekDayKey, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

function GoalsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [weekStartDate, setWeekStartDate] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [draft, setDraft] = useState<WeeklyGoalsData | null>(null);
  const [busy, setBusy] = useState(true);
  const [openDay, setOpenDay] = useState<WeekDayKey | null>("monday");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const loadedRef = useRef(false);
  const lastSavedPayloadRef = useRef("");
  const saveVersionRef = useRef(0);

  const weekStart = format(weekStartDate, "yyyy-MM-dd");
  const weekEndDate = useMemo(() => addDays(weekStartDate, 6), [weekStartDate]);
  const dayCards = useMemo(
    () =>
      WEEK_DAY_KEYS.map((key, index) => ({
        key,
        date: addDays(weekStartDate, index),
      })),
    [weekStartDate],
  );
  const isCurrentWeek = isWithinInterval(new Date(), {
    start: weekStartDate,
    end: endOfDay(weekEndDate),
  });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadedRef.current = false;
    setBusy(true);
    setSaveState("idle");

    (async () => {
      try {
        const data = await fetchWeeklyGoals(user.id, weekStart);
        if (cancelled) return;
        setDraft(data);
        lastSavedPayloadRef.current = serializeGoalsPayload(data);
        loadedRef.current = true;
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to load goals");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, weekStart]);

  useEffect(() => {
    if (!isCurrentWeek) {
      setOpenDay("monday");
      return;
    }
    const index = dayCards.findIndex((day) => isSameDay(day.date, new Date()));
    setOpenDay(dayCards[index]?.key ?? "monday");
  }, [dayCards, isCurrentWeek]);

  useEffect(() => {
    if (!user || !draft || !loadedRef.current) return;
    const payload = serializeGoalsPayload(draft);
    if (payload === lastSavedPayloadRef.current) return;

    setSaveState("dirty");
    const handle = window.setTimeout(async () => {
      const version = saveVersionRef.current + 1;
      saveVersionRef.current = version;
      setSaveState("saving");
      try {
        const saved = await saveWeeklyGoals(user.id, draft);
        if (saveVersionRef.current !== version) return;
        lastSavedPayloadRef.current = serializeGoalsPayload(saved);
        setDraft((current) => {
          if (!current || current.weekStart !== saved.weekStart) return current;
          return {
            ...current,
            id: saved.id,
            updatedAt: saved.updatedAt,
          };
        });
        setSaveState("saved");
      } catch (error) {
        if (saveVersionRef.current === version) {
          setSaveState("dirty");
          toast.error(error instanceof Error ? error.message : "Couldn't save goals");
        }
      }
    }, 650);

    return () => window.clearTimeout(handle);
  }, [draft, user]);

  const updateDraft = (recipe: (current: WeeklyGoalsData) => WeeklyGoalsData) => {
    setDraft((current) => (current ? recipe(current) : current));
  };

  const setDailyGoal = (day: WeekDayKey, id: string, patch: Partial<GoalItem>) => {
    updateDraft((current) => ({
      ...current,
      dailyGoals: {
        ...current.dailyGoals,
        [day]: current.dailyGoals[day].map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      },
    }));
  };

  if (loading || busy || !draft) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Sparkles className="mr-2 h-4 w-4 animate-pulse" /> loading goals…
      </div>
    );
  }

  const dailyGoals = Object.values(draft.dailyGoals).flat();
  const dailyProgress = progressFor(dailyGoals, dailyGoals.length);

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
              {format(weekStartDate, "MMM d")} - {format(weekEndDate, "MMM d")}
            </p>
            <h1 className="mt-1 text-3xl text-foreground">Goals</h1>
          </div>
          <div className="flex h-full items-center justify-end">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mb-5 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setWeekStartDate((date) => subWeeks(date, 1))}
          className="icon-button"
          aria-label="Previous week"
          title="Previous week"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setWeekStartDate(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          disabled={isCurrentWeek}
          className={`inline-flex min-w-36 items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition-colors ${
            isCurrentWeek
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-foreground"
          }`}
        >
          <CalendarDays className="h-4 w-4" />
          This week
        </button>
        <button
          type="button"
          onClick={() => setWeekStartDate((date) => addWeeks(date, 1))}
          className="icon-button"
          aria-label="Next week"
          title="Next week"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <section className="surface p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-muted-foreground">Week intention</p>
            <h2 className="mt-1 text-xl text-foreground">What matters most</h2>
          </div>
          <SaveBadge state={saveState} />
        </div>
        <textarea
          value={draft.intention}
          onChange={(event) =>
            updateDraft((current) => ({ ...current, intention: event.target.value }))
          }
          placeholder="Set the tone for the week"
          className="min-h-24 w-full resize-none rounded-2xl border border-border bg-background/70 px-4 py-3 text-base text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </section>

      <section className="mt-5">
        <div className="mb-3 flex items-center justify-between px-1">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Day 1-7</p>
            <h2 className="mt-1 text-xl text-foreground">Daily three</h2>
          </div>
          <ProgressPill done={dailyProgress.done} total={dailyProgress.total} />
        </div>

        <div className="space-y-2">
          {dayCards.map(({ key, date }, index) => {
            const isOpen = openDay === key;
            const dayProgress = progressFor(draft.dailyGoals[key], 3);
            const dateIsToday = isSameDay(date, new Date());
            return (
              <article key={key} className="surface overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenDay(isOpen ? null : key)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black ${
                        dateIsToday
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-base font-bold text-foreground">
                          {DAY_LABELS[key]}
                        </span>
                        {dateIsToday && (
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                            Today
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {format(date, "MMM d")}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                    <span className="text-xs font-bold">
                      {dayProgress.done}/{dayProgress.total}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </span>
                </button>

                {isOpen && (
                  <div className="space-y-2 border-t border-border px-4 pb-4 pt-3">
                    {draft.dailyGoals[key].map((item, goalIndex) => (
                      <GoalRow
                        key={item.id}
                        item={item}
                        placeholder={`Goal ${goalIndex + 1}`}
                        onDone={(done) => setDailyGoal(key, item.id, { done })}
                        onText={(text) => setDailyGoal(key, item.id, { text })}
                      />
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function GoalRow({
  item,
  placeholder,
  onDone,
  onText,
  trailing,
}: {
  item: GoalItem;
  placeholder: string;
  onDone: (done: boolean) => void;
  onText: (text: string) => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center gap-2 rounded-2xl bg-muted/45 px-2 py-2">
      <button
        type="button"
        onClick={() => onDone(!item.done)}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
          item.done ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
        }`}
        aria-label={item.done ? "Mark incomplete" : "Mark complete"}
        title={item.done ? "Mark incomplete" : "Mark complete"}
      >
        {item.done ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
      </button>
      <input
        value={item.text}
        onChange={(event) => onText(event.target.value)}
        placeholder={placeholder}
        className={`min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground ${
          item.done ? "text-muted-foreground line-through" : ""
        }`}
      />
      {trailing}
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  const label =
    state === "saving"
      ? "Saving"
      : state === "dirty"
        ? "Unsaved"
        : state === "saved"
          ? "Saved"
          : "Ready";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold uppercase text-muted-foreground">
      {state === "saved" ? (
        <Check className="h-3 w-3 text-primary" />
      ) : (
        <Target className="h-3 w-3" />
      )}
      {label}
    </span>
  );
}

function ProgressPill({ done, total }: { done: number; total: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">
      <ClipboardList className="h-3.5 w-3.5" />
      {done}/{total || 0}
    </span>
  );
}

function progressFor(items: GoalItem[], totalOverride?: number) {
  const filled = items.filter((item) => item.text.trim().length > 0);
  return {
    done: filled.filter((item) => item.done).length,
    total: totalOverride ?? filled.length,
  };
}
