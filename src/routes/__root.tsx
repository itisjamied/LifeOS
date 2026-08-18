import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import appCss from "../styles.css?url";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { BookOpen, House, ListChecks, Settings, Target } from "lucide-react";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="paper-card max-w-sm p-8 text-center">
        <h1 className="text-6xl text-foreground">404</h1>
        <p className="mt-2 text-muted-foreground">This page wandered off the schedule.</p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "LifeOS" },
      {
        name: "description",
        content: "Mobile-first personal system for routines, goals, and journaling.",
      },
      { name: "theme-color", content: "#eff6fb" },
      { name: "theme-color", content: "#26365f", media: "(prefers-color-scheme: dark)" },
      { name: "color-scheme", content: "light dark" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "LifeOS" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { property: "og:title", content: "LifeOS" },
      { name: "twitter:title", content: "LifeOS" },
      {
        property: "og:description",
        content: "Mobile-first personal system for routines, goals, and journaling.",
      },
      {
        name: "twitter:description",
        content: "Mobile-first personal system for routines, goals, and journaling.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}

function PwaBootstrap() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    if (window.location.protocol !== "https:" && !isLocalhost) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installability should fail quietly rather than interrupting the habit flow.
    });
  }, []);

  return null;
}

function BottomNav() {
  const { user } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (!user) return null;
  const isHabitsArea =
    path === "/today" ||
    path === "/grid" ||
    path === "/stats" ||
    path === "/manage" ||
    path.startsWith("/habit/");
  const tab = (
    to: string,
    icon: React.ReactNode,
    label: string,
    active = path === to,
    variant: "side" | "cluster" = "side",
  ) => {
    return (
      <Link
        to={to}
        aria-label={label}
        title={label}
        className={`flex items-center justify-center transition-colors ${
          variant === "side" ? "h-12 min-w-12 flex-1" : "h-11 min-w-11 flex-1"
        } ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
      >
        <span
          className={`flex items-center justify-center rounded-full transition-all ${
            variant === "side" ? "h-10 w-10" : "h-9 w-9"
          } ${
            active
              ? variant === "side"
                ? "bg-primary/15 shadow-sm"
                : "bg-background/80 shadow-sm"
              : ""
          }`}
        >
          {icon}
        </span>
        <span className="sr-only">{label}</span>
      </Link>
    );
  };
  return (
    <nav
      className="fixed right-4 left-4 z-40"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-[minmax(2.75rem,1fr)_minmax(10.5rem,12rem)_minmax(2.75rem,1fr)] items-center gap-2 rounded-[2rem] border border-border bg-card/90 px-2 py-2 shadow-xl backdrop-blur">
        <div className="flex min-w-0 justify-start">
          {tab("/", <House className="h-5 w-5" />, "Home")}
        </div>
        <div className="z-10 grid w-full grid-cols-3 gap-1 justify-self-center">
          {tab("/today", <ListChecks className="h-5 w-5" />, "Habits", isHabitsArea, "cluster")}
          {tab("/goals", <Target className="h-5 w-5" />, "Goals", path === "/goals", "cluster")}
          {tab(
            "/journal",
            <BookOpen className="h-5 w-5" />,
            "Journal",
            path === "/journal",
            "cluster",
          )}
        </div>
        <div className="flex min-w-0 justify-end">
          {tab("/settings", <Settings className="h-5 w-5" />, "Settings")}
        </div>
      </div>
    </nav>
  );
}

function RootComponent() {
  return (
    <>
      <PwaBootstrap />
      <main
        className="mx-auto min-h-screen max-w-md lg:max-w-6xl"
        style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}
      >
        <Outlet />
      </main>
      <BottomNav />
    </>
  );
}
