import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { ListChecks, Settings, Pencil, Flame } from "lucide-react";

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
      { title: "Cycle — your 28-day routine" },
      {
        name: "description",
        content:
          "Mobile-first 28-day maintenance routine tracker. Wake up, see what's due, check it off.",
      },
      { name: "theme-color", content: "#eff6fb" },
      { property: "og:title", content: "Cycle — your 28-day routine" },
      { name: "twitter:title", content: "Cycle — your 28-day routine" },
      {
        property: "og:description",
        content:
          "Mobile-first 28-day maintenance routine tracker. Wake up, see what's due, check it off.",
      },
      {
        name: "twitter:description",
        content:
          "Mobile-first 28-day maintenance routine tracker. Wake up, see what's due, check it off.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
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

function BottomNav() {
  const { user } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (!user) return null;
  const tab = (to: string, icon: React.ReactNode, label: string) => {
    const active = path === to;
    return (
      <Link
        to={to}
        aria-label={label}
        title={label}
        className={`flex flex-1 items-center justify-center py-3 transition-colors ${
          active ? "text-primary" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${
            active ? "bg-primary/15 shadow-sm" : ""
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
      className="fixed right-4 left-4 z-40 rounded-[2rem] border border-border bg-card/90 shadow-xl backdrop-blur"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-md">
        {tab("/", <ListChecks className="h-5 w-5" />, "Today")}
        {tab("/stats", <Flame className="h-5 w-5" />, "Stats")}
        {tab("/manage", <Pencil className="h-5 w-5" />, "Edit")}
        {tab("/settings", <Settings className="h-5 w-5" />, "Settings")}
      </div>
    </nav>
  );
}

function RootComponent() {
  return (
    <>
      <main className="mx-auto min-h-screen max-w-md lg:max-w-6xl pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </>
  );
}
