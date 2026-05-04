import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Mode = "light" | "dark";

function getInitial(): Mode {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("theme") as Mode | null;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(mode: Mode) {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", mode === "dark" ? "#1a1722" : "#fafaf9");
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const m = getInitial();
    setMode(m);
    apply(m);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Mode = mode === "dark" ? "light" : "dark";
    setMode(next);
    localStorage.setItem("theme", next);
    apply(next);
  };

  if (!mounted) return <div className={`h-9 w-9 ${className}`} />;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
      className={`relative flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-transform hover:scale-105 active:scale-95 ${className}`}
    >
      {mode === "dark" ? (
        <Sun className="h-4 w-4 animate-pop" />
      ) : (
        <Moon className="h-4 w-4 animate-pop" />
      )}
    </button>
  );
}
