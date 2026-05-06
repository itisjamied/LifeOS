import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRoutine, type FullTask, type VariantRow } from "@/lib/routine-data";
import { glyphFor, COLOR_TOKENS, colorValue, isHexColor, firstGrapheme } from "@/lib/symbols";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Trash2,
  ChevronLeft,
  Sparkles,
  Sun,
  Moon,
  CircleDashed,
  ChevronUp,
  ChevronDown,
  GripVertical,
  ArrowUpDown,
  Check,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/manage")({
  head: () => ({
    meta: [
      { title: "Manage routines — Cycle" },
      { name: "description", content: "Edit your tasks, variants, sub-steps and 28-day schedule." },
    ],
  }),
  component: ManagePage,
});

const TIME_OPTIONS: { value: string; label: string; icon: React.ReactNode }[] = [
  { value: "am", label: "Morning", icon: <Sun className="h-3.5 w-3.5" /> },
  { value: "pm", label: "Evening", icon: <Moon className="h-3.5 w-3.5" /> },
  { value: "any", label: "Anytime", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { value: "other", label: "Other", icon: <CircleDashed className="h-3.5 w-3.5" /> },
];

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function ManagePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [routine, setRoutine] = useState<FullTask[] | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "am" | "pm" | "any" | "other">("all");
  const [reordering, setReordering] = useState(false);
  const [draftOrder, setDraftOrder] = useState<FullTask[] | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  const reload = async () => {
    if (!user) return;
    const data = await fetchAllRoutine(user.id);
    setRoutine(data);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const editingTask = useMemo(
    () => routine?.find((r) => r.task.id === editingTaskId) ?? null,
    [routine, editingTaskId],
  );

  if (!routine) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Sparkles className="mr-2 h-4 w-4 animate-pulse" /> loading…
      </div>
    );
  }

  if (editingTask && user) {
    return (
      <TaskEditor
        userId={user.id}
        full={editingTask}
        onClose={() => setEditingTaskId(null)}
        onChange={reload}
      />
    );
  }

  const addTask = async () => {
    if (!user) return;
    const baseName = "new task";
    let name = baseName;
    let i = 2;
    while (routine.some((r) => r.task.name === name)) name = `${baseName} ${i++}`;
    const sortOrder = routine.length;
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        name,
        color: "routine-oral",
        time_of_day: "am",
        sort_order: sortOrder,
      })
      .select("id")
      .single();
    if (error || !data) return toast.error(error?.message ?? "Couldn't add task");
    await reload();
    setEditingTaskId(data.id);
  };

  const startReorder = () => {
    setDraftOrder([...routine]);
    setReordering(true);
  };
  const cancelReorder = () => {
    setDraftOrder(null);
    setReordering(false);
    setDragIdx(null);
  };
  const saveReorder = async () => {
    if (!draftOrder) return;
    setRoutine(draftOrder);
    const updates = await Promise.all(
      draftOrder.map((ft, idx) =>
        supabase.from("tasks").update({ sort_order: idx }).eq("id", ft.task.id),
      ),
    );
    if (updates.some((u) => u.error)) {
      toast.error("Couldn't save order");
      await reload();
    } else {
      toast.success("Order saved");
    }
    setReordering(false);
    setDraftOrder(null);
    setDragIdx(null);
  };

  const onDragStart = (i: number) => setDragIdx(i);
  const onDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i || !draftOrder) return;
    const next = [...draftOrder];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(i, 0, moved);
    setDraftOrder(next);
    setDragIdx(i);
  };

  const list = reordering && draftOrder ? draftOrder : routine;
  const visible = reordering
    ? list
    : filter === "all"
      ? list
      : list.filter((ft) => ft.task.time_of_day === filter);

  return (
    <div className="px-5 pt-10 animate-fade-up">
      <header className="mb-7 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Edit</p>
          <h1 className="mt-1 text-4xl text-foreground">Manage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {reordering ? "Move tasks, then save." : "Tap a task to edit."}
          </p>
        </div>
        <ThemeToggle />
      </header>

      {/* Filter + reorder controls */}
      {!reordering ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(
            [
              { v: "all", label: "All" },
              { v: "am", label: "Morning" },
              { v: "any", label: "Anytime" },
              { v: "pm", label: "Evening" },
              { v: "other", label: "Other" },
            ] as const
          ).map((f) => (
            <button
              key={f.v}
              type="button"
              onClick={() => setFilter(f.v)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                filter === f.v
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
          <button
            type="button"
            onClick={startReorder}
            className=" mr-auto lg:ml-auto inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground mt-10"
          >
            <ArrowUpDown className="h-3.5 w-3.5" /> Reorder
          </button>
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2">
          <Button size="sm" onClick={saveReorder} className="rounded-full">
            <Check className="h-3.5 w-3.5" /> Save order
          </Button>
          <Button size="sm" variant="outline" onClick={cancelReorder} className="rounded-full">
            Cancel
          </Button>
        </div>
      )}

      <ul className="space-y-2">
        {visible.map((ft, idx) => {
          const variantCount = ft.variants.length;
          const scheduledDays = ft.schedule.filter((s) => s.variant_id).length;
          const isDragging = reordering && dragIdx === idx;
          return (
            <li
              key={ft.task.id}
              draggable={reordering}
              onDragStart={() => reordering && onDragStart(idx)}
              onDragOver={(e) => reordering && onDragOver(e, idx)}
              onDragEnd={() => setDragIdx(null)}
              className={`flex items-stretch gap-1.5 ${isDragging ? "opacity-50" : ""}`}
            >
              <button
                type="button"
                disabled={reordering}
                onClick={() => setEditingTaskId(ft.task.id)}
                className={`surface flex flex-1 items-center gap-3 px-4 py-3.5 text-left ${
                  reordering ? "cursor-grab active:cursor-grabbing" : "surface-interactive"
                }`}
              >
                {reordering && <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
                  style={{ backgroundColor: colorValue(ft.task.color) }}
                  aria-hidden
                >
                  {glyphFor(ft.variants[0]?.symbol)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold text-foreground">
                    {ft.task.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {timeLabel(ft.task.time_of_day)} · {variantCount} variant
                    {variantCount === 1 ? "" : "s"} · {scheduledDays}/28 days
                  </span>
                </span>
              </button>
              {reordering && draftOrder && (
                <ReorderButtons
                  index={idx}
                  count={draftOrder.length}
                  label={ft.task.name}
                  onMove={(from, to) => {
                    setDraftOrder((current) => (current ? moveItem(current, from, to) : current));
                    setDragIdx(null);
                  }}
                />
              )}
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="surface p-5 text-center text-sm text-muted-foreground">
            No tasks match this filter.
          </li>
        )}
      </ul>

      {!reordering && (
        <Button onClick={addTask} className="mt-5 w-full rounded-full">
          <Plus className="h-4 w-4" /> Add new task
        </Button>
      )}
    </div>
  );
}

function timeLabel(v: string) {
  return TIME_OPTIONS.find((t) => t.value === v)?.label ?? v;
}

function ReorderButtons({
  index,
  count,
  label,
  onMove,
}: {
  index: number;
  count: number;
  label: string;
  onMove: (from: number, to: number) => void;
}) {
  return (
    <div className="flex shrink-0 flex-col overflow-hidden rounded-full border border-border bg-card shadow-sm">
      <button
        type="button"
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
        className="flex h-8 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
        aria-label={`Move ${label} up`}
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        disabled={index === count - 1}
        onClick={() => onMove(index, index + 1)}
        className="flex h-8 w-9 items-center justify-center border-t border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
        aria-label={`Move ${label} down`}
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );
}

// ----------------- Task editor -----------------

function TaskEditor({
  userId,
  full,
  onClose,
  onChange,
}: {
  userId: string;
  full: FullTask;
  onClose: () => void;
  onChange: () => Promise<void> | void;
}) {
  const [name, setName] = useState(full.task.name);
  const [color, setColor] = useState(full.task.color);
  const [timeOfDay, setTimeOfDay] = useState<string>(full.task.time_of_day);
  const [variants, setVariants] = useState<VariantRow[]>(full.variants);
  const [schedule, setSchedule] = useState<Record<number, string | null>>(() => {
    const map: Record<number, string | null> = {};
    for (let d = 1; d <= 28; d++) map[d] = null;
    for (const s of full.schedule) map[s.cycle_day] = s.variant_id ?? null;
    return map;
  });
  const [busy, setBusy] = useState(false);
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [dayMenuPosition, setDayMenuPosition] = useState<{
    left: number;
    bottom: number;
    maxHeight: number;
    width: number;
  } | null>(null);
  const [vReordering, setVReordering] = useState(false);
  const [vDraft, setVDraft] = useState<VariantRow[] | null>(null);
  const [vDragIdx, setVDragIdx] = useState<number | null>(null);

  const saveTaskMeta = async () => {
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Name can't be empty");
    if (trimmed.length > 60) return toast.error("Name too long");
    const { error } = await supabase
      .from("tasks")
      .update({ name: trimmed, color, time_of_day: timeOfDay })
      .eq("id", full.task.id);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    await onChange();
  };

  const addVariant = async () => {
    const { data, error } = await supabase
      .from("task_variants")
      .insert({
        user_id: userId,
        task_id: full.task.id,
        symbol: "",
        label: "new variant",
        steps: [],
        sort_order: variants.length,
      })
      .select("*")
      .single();
    if (error || !data) return toast.error(error?.message ?? "Couldn't add variant");
    setVariants((v) => [...v, data]);
  };

  const updateVariant = async (id: string, patch: Partial<VariantRow>) => {
    setVariants((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));
    const { error } = await supabase.from("task_variants").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  };

  const deleteVariant = async (id: string) => {
    if (!confirm("Delete this variant? Days using it will become empty.")) return;
    setBusy(true);
    // Clear schedule entries pointing at this variant
    await supabase.from("task_schedule").delete().eq("variant_id", id);
    const { error } = await supabase.from("task_variants").delete().eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setVariants((vs) => vs.filter((v) => v.id !== id));
    setSchedule((m) => {
      const out = { ...m };
      for (const d in out)
        if (out[d as unknown as number] === id) out[d as unknown as number] = null;
      return out;
    });
  };

  const startVReorder = () => {
    setVDraft([...variants]);
    setVReordering(true);
  };
  const cancelVReorder = () => {
    setVDraft(null);
    setVReordering(false);
    setVDragIdx(null);
  };
  const saveVReorder = async () => {
    if (!vDraft) return;
    setVariants(vDraft);
    const updates = await Promise.all(
      vDraft.map((v, idx) =>
        supabase.from("task_variants").update({ sort_order: idx }).eq("id", v.id),
      ),
    );
    if (updates.some((u) => u.error)) toast.error("Couldn't save order");
    else toast.success("Order saved");
    setVReordering(false);
    setVDraft(null);
    setVDragIdx(null);
  };
  const onVDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (vDragIdx === null || vDragIdx === i || !vDraft) return;
    const next = [...vDraft];
    const [moved] = next.splice(vDragIdx, 1);
    next.splice(i, 0, moved);
    setVDraft(next);
    setVDragIdx(i);
  };

  const toggleDayMenu = (day: number, target: HTMLButtonElement) => {
    if (activeDay === day) {
      setActiveDay(null);
      setDayMenuPosition(null);
      return;
    }

    // get the day clicked button positions
    const rect = target.getBoundingClientRect();
    // kep menu 12px away from viewpoet edge
    const viewportPadding = 12;

    //get size of screen
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    //set width for popup
    const width = Math.min(176, Math.max(0, viewportWidth - viewportPadding * 2));

    //center popup horizontaly to button but keep it in viewport
    const centeredLeft = rect.left + rect.width / 2 - width / 2;

    //clamp popup so it doesnt go off left or right edge of screen
    const left = Math.min(
      Math.max(centeredLeft, viewportPadding),
      Math.max(viewportPadding, viewportWidth - viewportPadding - width),
    );

    setDayMenuPosition({
      //horizontal position
      left,

      // verticle position
      bottom: viewportHeight - rect.bottom - 100,

      //max height
      maxHeight: Math.max(80, rect.top - viewportPadding),

      //width
      width,
    });
    setActiveDay(day);
  };

  const setDay = async (day: number, variantId: string | null) => {
    const prev = schedule[day];
    setSchedule((m) => ({ ...m, [day]: variantId }));
    setActiveDay(null);
    setDayMenuPosition(null);
    // Find existing schedule row
    const existing = full.schedule.find((s) => s.cycle_day === day);
    if (variantId === null) {
      if (existing) await supabase.from("task_schedule").delete().eq("id", existing.id);
    } else if (existing) {
      const { error } = await supabase
        .from("task_schedule")
        .update({ variant_id: variantId })
        .eq("id", existing.id);
      if (error) {
        toast.error(error.message);
        setSchedule((m) => ({ ...m, [day]: prev }));
      }
    } else {
      const { data, error } = await supabase
        .from("task_schedule")
        .insert({ user_id: userId, task_id: full.task.id, cycle_day: day, variant_id: variantId })
        .select("*")
        .single();
      if (error) {
        toast.error(error.message);
        setSchedule((m) => ({ ...m, [day]: prev }));
      } else if (data) {
        full.schedule.push(data);
      }
    }
  };

  const deleteTask = async () => {
    if (!confirm(`Delete "${full.task.name}" and all its variants and history?`)) return;
    setBusy(true);
    await supabase.from("completions").delete().eq("task_id", full.task.id);
    await supabase.from("task_schedule").delete().eq("task_id", full.task.id);
    await supabase.from("task_variants").delete().eq("task_id", full.task.id);
    const { error } = await supabase.from("tasks").delete().eq("id", full.task.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    await onChange();
    onClose();
  };

  return (
    <div className="px-5 pt-6 pb-10 animate-fade-up">
      <button
        type="button"
        onClick={onClose}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> All tasks
      </button>

      {/* Identity */}
      <section className="surface mb-5 space-y-4 p-5">
        <div className="space-y-1.5">
          <Label htmlFor="task-name">Name</Label>
          <Input
            id="task-name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>When</Label>
          <div className="grid grid-cols-2 gap-2">
            {TIME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTimeOfDay(opt.value)}
                className={`flex items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-all ${
                  timeOfDay === opt.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Color</Label>
          <div className="flex flex-wrap gap-2">
            {COLOR_TOKENS.map((c) => (
              <button
                key={c.token}
                type="button"
                onClick={() => setColor(c.token)}
                aria-label={c.label}
                className={`h-7 w-7 rounded-full border-2 transition-transform ${
                  color === c.token
                    ? "scale-110 border-foreground"
                    : "border-transparent hover:scale-105"
                }`}
                style={{ backgroundColor: `var(--${c.token})` }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label
              className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-border overflow-hidden"
              style={
                isHexColor(color) ? { backgroundColor: color, borderStyle: "solid" } : undefined
              }
              title="Pick a custom color"
            >
              <input
                type="color"
                value={isHexColor(color) ? color : "#7aa9d6"}
                onChange={(e) => setColor(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              {!isHexColor(color) && <Plus className="h-4 w-4 text-muted-foreground" />}
            </label>
            <Input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#7aa9d6 or token name"
              className="h-9 flex-1 font-mono text-xs"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Pick a preset above, use the color wheel, or paste a hex code like{" "}
            <span className="font-mono">#ff8800</span>.
          </p>
        </div>

        <Button onClick={saveTaskMeta} className="w-full rounded-full">
          Save
        </Button>
      </section>

      {/* Variants */}
      <section className="mb-5">
        <h2 className="mb-3 flex items-center justify-between text-sm font-semibold uppercase text-muted-foreground">
          Variants
          <div className="flex items-center gap-1.5">
            {variants.length > 1 && !vReordering && (
              <button
                type="button"
                onClick={startVReorder}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowUpDown className="h-3 w-3" /> Reorder
              </button>
            )}
            {vReordering && (
              <>
                <button
                  type="button"
                  onClick={saveVReorder}
                  className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground"
                >
                  <Check className="h-3 w-3" /> Save
                </button>
                <button
                  type="button"
                  onClick={cancelVReorder}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                >
                  Cancel
                </button>
              </>
            )}
            {!vReordering && (
              <button
                type="button"
                onClick={addVariant}
                className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-transform hover:scale-105 active:scale-95"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            )}
          </div>
        </h2>
        {vReordering && vDraft ? (
          <ul className="space-y-2">
            {vDraft.map((v, i) => (
              <li
                key={v.id}
                draggable
                onDragStart={() => setVDragIdx(i)}
                onDragOver={(e) => onVDragOver(e, i)}
                onDragEnd={() => setVDragIdx(null)}
                className={`surface flex items-center gap-3 px-4 py-3 cursor-grab active:cursor-grabbing ${vDragIdx === i ? "opacity-50" : ""}`}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: colorValue(color) }}
                >
                  {glyphFor(v.symbol)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                  {v.label}
                </span>
                <ReorderButtons
                  index={i}
                  count={vDraft.length}
                  label={v.label}
                  onMove={(from, to) => {
                    setVDraft((current) => (current ? moveItem(current, from, to) : current));
                    setVDragIdx(null);
                  }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-3">
            {variants.map((v) => (
              <VariantEditor
                key={v.id}
                variant={v}
                taskColor={color}
                onUpdate={(patch) => updateVariant(v.id, patch)}
                onDelete={() => deleteVariant(v.id)}
              />
            ))}
            {variants.length === 0 && (
              <li className="surface p-5 text-center text-sm text-muted-foreground">
                No variants yet. Add one to schedule it on days below.
              </li>
            )}
          </ul>
        )}
      </section>

      {/* Schedule */}
      <section className="mb-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
          28-day schedule
        </h2>
        <div className="surface p-3">
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => {
              const vId = schedule[d];
              const variant = variants.find((v) => v.id === vId);
              const isOpen = activeDay === d;
              return (
                <div key={d} className="relative">
                  <button
                    type="button"
                    onClick={(e) => toggleDayMenu(d, e.currentTarget)}
                    className={`relative flex h-12 w-full flex-col items-center justify-center overflow-hidden rounded-lg border text-[10px] transition-all ${
                      variant
                        ? "border-border text-foreground"
                        : isOpen
                          ? "border-primary bg-card"
                          : "border-border bg-card text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {variant && (
                      <span
                        aria-hidden
                        className="absolute inset-0 opacity-50"
                        style={{ backgroundColor: colorValue(color) }}
                      />
                    )}
                    <span className="relative text-[10px] opacity-80">{d}</span>
                    <span className="relative text-base font-bold leading-none">
                      {variant ? glyphFor(variant.symbol) : "·"}
                    </span>
                  </button>
                  {isOpen && dayMenuPosition && (
                    <div
                      className="surface fixed z-30 overflow-y-auto overscroll-contain p-1 shadow-lg animate-fade-up"
                      style={dayMenuPosition}
                    >
                      <button
                        type="button"
                        onClick={() => setDay(d, null)}
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
                      >
                        <span className="inline-block h-4 w-4 rounded-full border border-dashed border-border" />
                        none
                      </button>
                      {variants.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setDay(d, v.id)}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                        >
                          <span
                            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
                            style={{ backgroundColor: colorValue(color) }}
                          >
                            {glyphFor(v.symbol)}
                          </span>
                          <span className="truncate">{v.label}</span>
                        </button>
                      ))}
                      {variants.length === 0 && (
                        <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
                          Add a variant first
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Tap a day to assign a variant or clear it.
          </p>
        </div>
      </section>

      <Button
        variant="outline"
        disabled={busy}
        onClick={deleteTask}
        className="w-full rounded-full text-destructive hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" /> Delete this task
      </Button>
    </div>
  );
}

// ----------------- Variant editor -----------------

function VariantEditor({
  variant,
  taskColor,
  onUpdate,
  onDelete,
}: {
  variant: VariantRow;
  taskColor: string;
  onUpdate: (patch: Partial<VariantRow>) => void;
  onDelete: () => void;
}) {
  const [customSym, setCustomSym] = useState("");
  const [label, setLabel] = useState(variant.label);
  const [steps, setSteps] = useState<string[]>((variant.steps as string[]) ?? []);
  const [newStep, setNewStep] = useState("");

  useEffect(() => {
    setLabel(variant.label);
    setSteps((variant.steps as string[]) ?? []);
  }, [variant.id]); // reset only when row swaps

  const persistSteps = (next: string[]) => {
    setSteps(next);
    onUpdate({ steps: next });
  };

  const addStep = () => {
    const t = newStep.trim();
    if (!t) return;
    if (t.length > 80) return toast.error("Sub-step too long");
    persistSteps([...steps, t]);
    setNewStep("");
  };

  return (
    <li className="surface p-4">
      <div className="flex items-start gap-3">
        {/* Symbol picker */}
        <div className="flex flex-col items-center gap-1">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full text-base font-bold text-white"
            style={{ backgroundColor: colorValue(taskColor) }}
            aria-hidden
          >
            {glyphFor(variant.symbol)}
          </span>
          <span className="text-[10px] text-muted-foreground">symbol</span>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <Input
            value={label}
            maxLength={40}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() =>
              label !== variant.label && onUpdate({ label: label.trim() || variant.label })
            }
            placeholder="variant label"
            className="font-semibold"
          />
          <Input
            value={customSym}
            onChange={(e) => setCustomSym(e.target.value)}
            onBlur={() => {
              const g = firstGrapheme(customSym);
              onUpdate({ symbol: g });
              setCustomSym("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="Emoji (optional) 🌿"
            className="h-8 text-sm"
            maxLength={8}
          />
        </div>

        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Delete variant"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Steps */}
      <div className="mt-4">
        <p className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">Sub-steps</p>
        <ul className="space-y-1.5">
          {steps.map((s, i) => (
            <li
              key={`${i}-${s}`}
              className="flex items-center gap-1 rounded-md bg-muted/50 px-2 py-1.5"
            >
              <div className="flex flex-col">
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => {
                    const next = [...steps];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    persistSteps(next);
                  }}
                  className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={i === steps.length - 1}
                  onClick={() => {
                    const next = [...steps];
                    [next[i + 1], next[i]] = [next[i], next[i + 1]];
                    persistSteps(next);
                  }}
                  className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <Input
                value={s}
                maxLength={80}
                onChange={(e) => {
                  const next = [...steps];
                  next[i] = e.target.value;
                  setSteps(next);
                }}
                onBlur={() => persistSteps(steps.map((x) => x.trim()).filter(Boolean))}
                className="h-7 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
              />
              <button
                type="button"
                onClick={() => persistSteps(steps.filter((_, idx) => idx !== i))}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Remove sub-step"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <Input
            value={newStep}
            maxLength={80}
            placeholder="Add sub-step…"
            onChange={(e) => setNewStep(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addStep();
              }
            }}
            className="h-8 text-sm"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addStep}
            className="rounded-full"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </li>
  );
}
