import type { TaskStats } from "./streaks";

export function statsToCSV(stats: TaskStats[]): string {
  const headers = [
    "Habit",
    "Current Streak (days)",
    "Longest Streak (days)",
    "Scheduled (90d)",
    "Completed (90d)",
    "Consistency (%)",
  ];
  const rows = stats.map((s) => [
    csvEscape(s.name),
    s.currentStreak,
    s.longestStreak,
    s.scheduledCount,
    s.completedCount,
    s.consistencyPct,
  ]);
  return [headers, ...rows].map((r) => r.join(",")).join("\n");
}

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function downloadFile(filename: string, content: BlobPart, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportStatsPDF(stats: TaskStats[]) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 48;
  let y = margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Habit Stats — Last 90 Days", margin, y);
  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120);
  y += 16;
  doc.text(`Generated ${new Date().toLocaleDateString()}`, margin, y);
  doc.setTextColor(0);
  y += 24;

  // Header row
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const cols = [
    { label: "Habit", x: margin, w: 180 },
    { label: "Current", x: margin + 190, w: 60 },
    { label: "Best", x: margin + 255, w: 50 },
    { label: "Done/Sched", x: margin + 310, w: 90 },
    { label: "Consistency", x: margin + 405, w: 90 },
  ];
  cols.forEach((c) => doc.text(c.label, c.x, y));
  y += 6;
  doc.setDrawColor(200);
  doc.line(margin, y, margin + 500, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const s of stats) {
    if (y > 740) {
      doc.addPage();
      y = margin;
    }
    const name = s.name.length > 32 ? s.name.slice(0, 30) + "…" : s.name;
    doc.text(name, cols[0].x, y);
    doc.text(`${s.currentStreak}d`, cols[1].x, y);
    doc.text(`${s.longestStreak}d`, cols[2].x, y);
    doc.text(`${s.completedCount}/${s.scheduledCount}`, cols[3].x, y);
    doc.text(`${s.consistencyPct}%`, cols[4].x, y);
    y += 18;
  }

  doc.save("habit-stats-90d.pdf");
}
