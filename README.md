# LifeOS

LifeOS is a mobile-first personal system built as a TypeScript React app. It tracks daily routines, task variants, completion streaks, weekly goals, and a private journal with folders, pages, rich text, and attachments.

## How The App Fits Together

```text
Browser / installed PWA
  -> TanStack Start + React routes
  -> Supabase JS client
  -> Supabase Auth, Postgres, and Storage

Build and hosting
  -> Vite
  -> TanStack Start server entry
  -> Cloudflare Worker runtime through Wrangler
```

There is no separate Express, Next.js API route layer, or custom Node backend in this repo. The backend is Supabase, and the web runtime is TanStack Start built for Cloudflare. Most application data reads and writes happen directly from React code through `@supabase/supabase-js`, protected by Supabase row-level security policies.

## Core Stack

| Area                  | Technology                       | How it is used                                                                                                                                             |
| --------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language              | TypeScript                       | Main app language for routes, components, Supabase types, and utilities.                                                                                   |
| UI runtime            | React 19                         | Component model and client interaction state.                                                                                                              |
| Routing/app framework | TanStack Router + TanStack Start | File-based routes in `src/routes`, generated route tree in `src/routeTree.gen.ts`, app shell in `src/routes/__root.tsx`, router setup in `src/router.tsx`. |
| Bundler/dev server    | Vite 7                           | Local dev server, production build, plugin pipeline.                                                                                                       |
| Styling               | Tailwind CSS 4                   | Utility styling loaded from `src/styles.css` using Tailwind v4 CSS-first setup.                                                                            |
| UI component style    | shadcn-style local components    | `components.json` uses the `new-york` style, Tailwind CSS variables, and Lucide icons. Components are local under `src/components/ui`.                     |
| Icons                 | `lucide-react`                   | Icons in navigation, forms, habit cards, journal toolbar, settings, and stats.                                                                             |
| Auth                  | Supabase Auth                    | Email/password signup, signin, signout, session persistence.                                                                                               |
| Database              | Supabase Postgres                | Routine, completions, journal, attachment metadata, profiles, and weekly goals.                                                                            |
| Storage               | Supabase Storage                 | Private `journal-attachments` bucket for uploaded note files/images.                                                                                       |
| Hosting target        | Cloudflare Worker                | `@cloudflare/vite-plugin`, `wrangler.jsonc`, and generated `dist/server/wrangler.json`.                                                                    |
| PWA                   | Web manifest + service worker    | `public/manifest.webmanifest` and `public/sw.js` make the app installable and cache the app shell.                                                         |
| Dates                 | `date-fns`                       | Recurring schedule math, week navigation, calendar dates, streak windows, labels.                                                                          |
| Toasts                | `sonner`                         | Success/error notifications across auth, saves, exports, journal, and routine editing.                                                                     |
| PDF export            | `jspdf`                          | Dynamically imported by `src/lib/stats-export.ts` for settings-page PDF export.                                                                            |

## App Structure

```text
src/
  components/
    theme-toggle.tsx
    ui/
      app-dialog.tsx
      button.tsx
      input.tsx
      label.tsx
      sonner.tsx
  integrations/
    supabase/
      client.ts
      types.ts
  lib/
    auth-context.tsx
    schedule.ts
    goals-data.ts
    habit-detail.ts
    journal-data.ts
    routine-data.ts
    routine-seed.ts
    seed-routine.ts
    stats-export.ts
    streaks.ts
    symbols.ts
    utils.ts
  routes/
    __root.tsx
    auth.tsx
    goals.tsx
    grid.tsx
    habit.$taskId.tsx
    index.tsx
    journal.tsx
    manage.tsx
    settings.tsx
  routeTree.gen.ts
  router.tsx
  styles.css
```

## Routes And Features

| Route            | File                           | Purpose                                                                                                                  |
| ---------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `/auth`          | `src/routes/auth.tsx`          | Email/password signup and signin with Supabase Auth.                                                                     |
| `/`              | `src/routes/index.tsx`         | Today view. Computes the active schedule slot, lists scheduled tasks by time of day, and upserts completions.            |
| `/grid`          | `src/routes/grid.tsx`          | Routine calendar showing which variant is scheduled for each task and slot.                                              |
| `/stats`         | `src/routes/stats.tsx`         | Progress view with current streak, best streak, and consistency.                                                         |
| `/habit/$taskId` | `src/routes/habit.$taskId.tsx` | Individual habit detail with calendar and streak runs.                                                                   |
| `/manage`        | `src/routes/manage.tsx`        | CRUD editor for tasks, variants, steps, colors, time-of-day labels, task order, variant order, and schedules.            |
| `/goals`         | `src/routes/goals.tsx`         | Weekly intention and daily three goals, autosaved into Supabase.                                                         |
| `/journal`       | `src/routes/journal.tsx`       | Private journal with folders, multi-page notes, rich-text toolbar, search/calendar views, bulk actions, and attachments. |
| `/settings`      | `src/routes/settings.tsx`      | Profile settings, routine start date, signout, CSV export, and PDF export.                                               |

`src/routes/__root.tsx` wraps the whole app with `AuthProvider`, the `Sonner` toaster, PWA registration, route metadata, and the authenticated bottom navigation.

## Supabase Backend

The Supabase project id in `supabase/config.toml` is:

```text
cmhkqczvjabptwtyzsgt
```

The app uses Supabase for three things:

1. Auth: users sign up/sign in with email and password.
2. Postgres: app data is stored in typed tables.
3. Storage: journal attachments are uploaded to a private bucket.

### Database Tables

| Table                 | Purpose                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`            | One row per auth user. Stores `display_name` and `routine_start_date`. Created automatically on signup by a trigger.            |
| `tasks`               | User-owned routine categories such as oral care, skin care, haircare, shower, etc. Includes color, time of day, and sort order. |
| `task_variants`       | Variants for a task. Stores symbol, label, steps as JSONB, and sort order.                                                      |
| `task_schedule`       | Maps each task to a variant for each recurring `schedule_slot`.                                                                 |
| `completions`         | Actual completion state per user/task/date, including completed steps, `done`, and `completed_at`.                              |
| `journal_folders`     | User-owned journal folders.                                                                                                     |
| `journal_notes`       | Note-level metadata: title, folder, tags, entry date/time, and legacy content fields.                                           |
| `journal_note_pages`  | Multi-page note bodies with title, heading, HTML content, plain-text content, entry date/time, and sort order.                  |
| `journal_attachments` | Attachment metadata: filename, MIME type, file size, and Supabase Storage path.                                                 |
| `weekly_goals`        | Weekly intention plus daily goals stored as JSONB.                                                                              |

### Security Model

All app tables enable row-level security. Policies restrict rows to `auth.uid() = user_id` or, for `profiles`, `auth.uid() = id`.

The `journal-attachments` storage bucket is private. Storage policies require authenticated users and keep access inside paths where the first folder segment is the user's id:

```text
journal-attachments/{userId}/{noteId}/{timestamp}-{filename}
```

### Migrations

Migrations live in `supabase/migrations` and create:

- Base routine schema, profile trigger, RLS policies, and indexes.
- A duplicate-task cleanup plus `UNIQUE (user_id, name)` on `tasks`.
- Journal folders, notes, attachments, storage bucket, policies, and indexes.
- Journal note pages, page dates/times, headings, and search index updates.
- Weekly goals table, RLS policy, index, and updated-at trigger.
- LifeOS naming updates for routine and schedule fields.

`src/integrations/supabase/types.ts` is the generated TypeScript database type file used by the data helpers.

## Data Flow

1. `AuthProvider` in `src/lib/auth-context.tsx` initializes the Supabase session, listens for auth changes, and exposes `user`, `session`, `loading`, and `signOut`.
2. Auth-protected routes redirect to `/auth` when no user is loaded.
3. Data helpers in `src/lib/*-data.ts` call Supabase tables directly.
4. The route components keep local UI state and write changes back to Supabase.
5. Supabase RLS is the main backend authorization boundary.

Examples:

- Today view fetches routine rows plus the user's profile, computes the current schedule slot, then loads completions for the selected date.
- Checking a task step optimistically updates local state and upserts into `completions`.
- Manage view edits `tasks`, `task_variants`, and `task_schedule`.
- Journal uploads files to Supabase Storage and stores file metadata in `journal_attachments`.
- Goals autosave with a debounce into `weekly_goals`.
- Stats are derived from `completions`, schedules, and the profile routine start date.

## Design System And Styling

Styling is centered in `src/styles.css`:

- Tailwind v4 is imported with `@import "tailwindcss" source(none)` and `@source "../src"`.
- `tw-animate-css` is imported for animation utilities.
- CSS custom properties define light/dark theme tokens, radius tokens, app color tokens, and routine color tokens.
- Dark mode toggles the `.dark` class on `document.documentElement`.
- `ThemeToggle` stores the user's preference in `localStorage`.
- The app loads Inter from Google Fonts with a local `@font-face` declaration.

Local UI helpers:

- `cn` in `src/lib/utils.ts` combines `clsx` and `tailwind-merge`.
- `Button` uses `@radix-ui/react-slot` for `asChild` and `class-variance-authority` for variants.
- `Label` wraps `@radix-ui/react-label`.
- `AppConfirmDialog` and `AppTextDialog` are custom modal primitives.
- `Toaster` wraps `sonner`.

## PWA Files

`public/manifest.webmanifest` defines:

- App name: `LifeOS`
- Short name: `LifeOS`
- Standalone portrait display
- Health/lifestyle/productivity categories
- 192px, 512px, and maskable icons
- Shortcuts for Today and Progress

`public/sw.js`:

- Caches the app shell on install.
- Deletes old caches on activate.
- Uses a network-first strategy for same-origin GET requests.
- Falls back to cached content, then `/`, when offline.

## Package Map

### Runtime Dependencies

| Package                    | Version     | Role                                                                       |
| -------------------------- | ----------- | -------------------------------------------------------------------------- |
| `@cloudflare/vite-plugin`  | `^1.25.5`   | Builds TanStack Start for Cloudflare. Enabled during `vite build`.         |
| `@radix-ui/react-label`    | `^2.1.8`    | Accessible label primitive used by the local `Label` component.            |
| `@radix-ui/react-slot`     | `^1.2.4`    | Slot composition used by the local `Button` component.                     |
| `@supabase/supabase-js`    | `^2.105.1`  | Supabase Auth, Postgres, and Storage client.                               |
| `@tailwindcss/vite`        | `^4.2.1`    | Tailwind CSS Vite plugin.                                                  |
| `@tanstack/react-router`   | `^1.168.0`  | File routes, links, navigation, router state, error handling.              |
| `@tanstack/react-start`    | `^1.167.14` | App framework and Vite plugin for TanStack Start.                          |
| `class-variance-authority` | `^0.7.1`    | Variant class definitions for UI components.                               |
| `clsx`                     | `^2.1.1`    | Conditional class name composition.                                        |
| `date-fns`                 | `^4.1.0`    | Date math, formatting, schedule windows, streak windows, journal calendar. |
| `jspdf`                    | `^4.2.1`    | PDF export from settings. Loaded only when exporting.                      |
| `lucide-react`             | `^0.575.0`  | Icon library across the UI.                                                |
| `react`                    | `^19.2.0`   | React runtime.                                                             |
| `react-dom`                | `^19.2.0`   | React DOM rendering.                                                       |
| `sonner`                   | `^2.0.7`    | Toast notifications.                                                       |
| `tailwind-merge`           | `^3.5.0`    | Merges Tailwind classes safely in `cn`.                                    |
| `tailwindcss`              | `^4.2.1`    | Styling framework.                                                         |
| `tw-animate-css`           | `^1.3.4`    | Animation CSS utilities imported by `src/styles.css`.                      |
| `vite-tsconfig-paths`      | `^6.0.2`    | Makes TypeScript path aliases work in Vite.                                |

### Development Dependencies

| Package                       | Version    | Role                                        |
| ----------------------------- | ---------- | ------------------------------------------- |
| `@eslint/js`                  | `^9.32.0`  | Base ESLint rules.                          |
| `@types/node`                 | `^22.16.5` | Node TypeScript types for config/tooling.   |
| `@types/react`                | `^19.2.0`  | React TypeScript types.                     |
| `@types/react-dom`            | `^19.2.0`  | React DOM TypeScript types.                 |
| `@vitejs/plugin-react`        | `^5.0.4`   | React plugin for Vite.                      |
| `eslint`                      | `^9.32.0`  | Lint runner.                                |
| `eslint-config-prettier`      | `^10.1.1`  | Disables rules that conflict with Prettier. |
| `eslint-plugin-prettier`      | `^5.2.6`   | Runs Prettier through ESLint.               |
| `eslint-plugin-react-hooks`   | `^5.2.0`   | React Hooks lint rules.                     |
| `eslint-plugin-react-refresh` | `^0.4.20`  | React Refresh lint rule.                    |
| `globals`                     | `^15.15.0` | Browser global definitions for ESLint.      |
| `prettier`                    | `^3.7.3`   | Code formatter.                             |
| `typescript`                  | `^5.8.3`   | Type checker/compiler.                      |
| `typescript-eslint`           | `^8.56.1`  | TypeScript ESLint parser and rules.         |
| `vite`                        | `^7.3.1`   | Dev server and build tool.                  |

## Important Config Files

| File                   | Purpose                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `package.json`         | Scripts, dependency list, ESM package mode, `sideEffects: false`.                                       |
| `package-lock.json`    | npm lockfile. This repo appears npm-oriented even though `bunfig.toml` exists.                          |
| `bunfig.toml`          | Bun install setting: `saveTextLockfile = false`.                                                        |
| `vite.config.ts`       | Vite plugins, env injection, aliasing, React dedupe, dev server host/port, Cloudflare build plugin.     |
| `tsconfig.json`        | Strict TypeScript, React JSX, ES2022 target, bundler module resolution, `@/*` path alias.               |
| `eslint.config.js`     | Flat ESLint config with TypeScript, React Hooks, React Refresh, Prettier.                               |
| `.prettierrc`          | Print width 100, semicolons, double quotes, trailing commas.                                            |
| `components.json`      | shadcn-style UI metadata: New York style, TSX, CSS variables, Slate base, Lucide icons.                 |
| `wrangler.jsonc`       | Cloudflare Worker config: app name, compatibility date, Node compatibility flag, TanStack server entry. |
| `supabase/config.toml` | Supabase project id.                                                                                    |

## Environment Variables

The Supabase client reads these names:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

For SSR/runtime environments, the client also falls back to:

```bash
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
```

The local `.env` also contains:

```bash
VITE_SUPABASE_PROJECT_ID=
```

That project id is not read by the app code directly, but it can be useful for Supabase tooling or project metadata.

## Running Locally

Install dependencies:

```bash
npm install
```

Start the Vite dev server:

```bash
npm run dev
```

The Vite config uses:

```text
host: ::
port: 8080
```

So the local app is normally available at:

```text
http://localhost:8080
```

Build for production:

```bash
npm run build
```

Build in development mode:

```bash
npm run build:dev
```

Preview the built Cloudflare Worker output:

```bash
npm run build
npm run preview
```

`npm run start` runs the same Wrangler dev command as `preview`.

## Database Setup

This repo includes Supabase migrations, but the Supabase CLI is not listed as an npm script or direct dependency. To apply the migrations, use the Supabase CLI externally or run the SQL files in the Supabase dashboard.

Typical CLI flow:

```bash
supabase link --project-ref cmhkqczvjabptwtyzsgt
supabase db push
```

For a local Supabase stack, use the Supabase CLI's local workflow, then point `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` at the local project.

## Hosting

This app is configured for Cloudflare through:

- `@cloudflare/vite-plugin` in `vite.config.ts`
- `wrangler.jsonc`
- `npm run build`
- `npm run preview` / `npm run start`

The production build emits Cloudflare runtime configuration under:

```text
dist/server/wrangler.json
```

There is no dedicated `deploy` script in `package.json`. A manual Wrangler deployment would look like:

```bash
npm run build
npx wrangler deploy --config dist/server/wrangler.json
```

In Cloudflare, configure the Supabase environment variables for the deployed Worker. Because the client code uses `VITE_*` values and the SSR fallback uses non-`VITE_*` names, keep both sets available when in doubt:

```bash
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
```

## Scripts

| Script              | Command                                                          | What it does                                            |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| `npm run dev`       | `vite dev`                                                       | Starts the local Vite dev server on port 8080.          |
| `npm run build`     | `WRANGLER_LOG_PATH=.wrangler/logs vite build`                    | Builds the production TanStack Start/Cloudflare output. |
| `npm run build:dev` | `WRANGLER_LOG_PATH=.wrangler/logs vite build --mode development` | Builds with Vite development mode.                      |
| `npm run preview`   | `wrangler dev --config dist/server/wrangler.json`                | Runs the built app locally in Wrangler. Build first.    |
| `npm run start`     | `wrangler dev --config dist/server/wrangler.json`                | Same as preview.                                        |
| `npm run lint`      | `eslint .`                                                       | Runs ESLint.                                            |
| `npm run format`    | `prettier --write .`                                             | Formats files with Prettier.                            |

## Notes And Gaps

- There is no test script configured in `package.json`.
- There is no explicit deploy script, only build and Wrangler preview/start.
- `seedRoutineIfEmpty` exists in `src/lib/seed-routine.ts`, but it is not currently imported by any route. Treat it as available seed logic, not active signup behavior.
- The app is private/auth-first: authenticated users get bottom navigation and app routes; unauthenticated users are sent to `/auth`.
- `routeTree.gen.ts` is generated TanStack Router output. Do not hand-edit it.
