import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile } from "@/lib/routine-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";
import { fetchAllRoutine } from "@/lib/routine-data";
import { computeStats } from "@/lib/streaks";
import { statsToCSV, downloadFile, exportStatsPDF } from "@/lib/stats-export";
import { parseISO } from "date-fns";
import { FileDown, FileText } from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Cycle" },
      { name: "description", content: "Adjust your cycle start date and account." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [start, setStart] = useState<string>("");
  const [name, setName] = useState<string>("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    fetchProfile(user.id).then((p) => {
      if (p) {
        setStart(p.cycle_start_date);
        setName(p.display_name ?? "");
      }
    });
  }, [user]);

  async function save() {
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ cycle_start_date: start, display_name: name })
      .eq("id", user.id);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  }

  return (
    <div className="px-5 pt-10 animate-fade-up">
      <header className="mb-7 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Account
          </p>
          <h1 className="mt-1 text-4xl text-foreground">Settings</h1>
        </div>
        <ThemeToggle />
      </header>

      <div className="surface space-y-5 p-5">
        <div className="space-y-1.5">
          <Label htmlFor="name">Display name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="start">Cycle start date</Label>
          <Input id="start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Day 1 of your 28-day cycle starts on this date.
          </p>
        </div>
        <Button onClick={save} className="w-full rounded-full">
          Save
        </Button>
      </div>

      <div className="surface mt-5 p-5">
        <p className="mb-1 text-sm font-semibold text-foreground">Export stats</p>
        <p className="mb-4 text-xs text-muted-foreground">
          Download your last 90 days of consistency data.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 rounded-full"
            onClick={async () => {
              if (!user) return;
              try {
                const routine = await fetchAllRoutine(user.id);
                const cs = start ? parseISO(start) : new Date();
                const stats = await computeStats(user.id, routine, cs);
                downloadFile("habit-stats-90d.csv", statsToCSV(stats), "text/csv");
                toast.success("CSV exported");
              } catch (e) {
                toast.error("Export failed");
              }
            }}
          >
            <FileDown className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button
            variant="outline"
            className="flex-1 rounded-full"
            onClick={async () => {
              if (!user) return;
              try {
                const routine = await fetchAllRoutine(user.id);
                const cs = start ? parseISO(start) : new Date();
                const stats = await computeStats(user.id, routine, cs);
                await exportStatsPDF(stats);
                toast.success("PDF exported");
              } catch (e) {
                toast.error("Export failed");
              }
            }}
          >
            <FileText className="mr-2 h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <div className="surface mt-5 p-5">
        <p className="mb-3 text-sm text-muted-foreground">Signed in as {user?.email}</p>
        <Button
          variant="outline"
          className="w-full rounded-full"
          onClick={async () => {
            await signOut();
            navigate({ to: "/auth" });
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
