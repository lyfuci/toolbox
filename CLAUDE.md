# CLAUDE.md

Project conventions for Claude Code (and any other AI assistant) working in
this repository.

## Project shape

Personal frontend toolset, **pure client-side, no backend, no API calls to
external services without explicit user trigger**. Hosted at
`https://toolbox.seansun.net`. Source at `github.com/lyfuci/toolbox`.

Tools live under `src/pages/` and are registered in `src/lib/tools.ts` — that
single file drives both the sidebar nav and the home page card grid.

## Stack (don't drift)

- **Package manager**: pnpm only. Never `npm install` or `yarn`. The lockfile
  is `pnpm-lock.yaml`. Version is pinned via `packageManager` in
  `package.json`.
- **Build**: Vite 8 + React 19 + TypeScript (strict). Path alias `@/` →
  `src/`.
- **Styling**: Tailwind CSS v4 (the zero-config one — no
  `tailwind.config.js`). Theme variables and dark-mode setup live in
  `src/index.css`.
- **UI components**: shadcn/ui (new-york style, zinc base color). Components
  are vendored into `src/components/ui/` via the `shadcn` CLI. Don't lint
  these (already excluded in `eslint.config.js`); don't hand-edit them either
  — re-run the CLI to update.
- **Router**: react-router v7, `createBrowserRouter`. Route definitions in
  `src/app/router.tsx`.
- **Icons**: `lucide-react` only.
- **Notifications**: `sonner` via `<Toaster />` mounted in `src/main.tsx`.
- **Node**: pinned via `.nvmrc` (currently `22`). CI uses the same.

## Conventions

- New UI primitives: prefer `pnpm dlx shadcn@latest add <name>` over
  hand-rolling.
- New tool page:
  1. `src/pages/<Name>.tsx`
  2. Add route in `src/app/router.tsx`
  3. Append to `src/lib/tools.ts` (icon + slug + description) — this single
     edit makes it appear in sidebar + home grid.
- Use `cn()` from `@/lib/utils` for conditional class merging.
- Default to dark theme (`html.dark` is set in `src/main.tsx`); design with
  the shadcn semantic tokens (`bg-background`, `text-foreground`,
  `text-muted-foreground`, etc.) so future light-mode swap is free.
- All file operations stay in the browser. If a tool needs heavy compute
  (e.g. `ffmpeg.wasm`), use a worker; never proxy user data through a
  server.

## Browser headers (important for ffmpeg.wasm)

The `/media` tool depends on `SharedArrayBuffer`, which requires the page to
be **cross-origin isolated**. Both response headers below must be present
on every HTML/JS response:

```
Cross-Origin-Opener-Policy:   same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Already configured:

- Dev: `vite.config.ts` sets `server.headers` and `preview.headers`.
- Prod: server Nginx `server` block adds them at the server level and re-adds
  them in any `location` that overrides headers (`/assets/`, `=/index.html`)
  — nginx does NOT inherit `add_header` across blocks once one is set.

If you add 3rd-party iframes or cross-origin resources to a tool, those
resources must send `Cross-Origin-Resource-Policy: cross-origin`, or COEP
will block them.

## Analytics

Google Analytics 4 (`G-WLZL6FRZ31`) is loaded once in `index.html` <head>.
Because the app is a SPA, gtag's auto pageview is **disabled**
(`send_page_view: false`) and replaced by `useGAPageview()` in
`src/app/Layout.tsx`, which fires `page_view` on every route change
(initial mount + navigation). **New tools require no analytics work** —
just add the route, the layout-level hook handles it.

If you ever add a route that bypasses `Layout`, call `useGAPageview()`
inside it, or pageviews on that route will be silent.

## Build and verify

```bash
pnpm typecheck    # tsc -b --noEmit
pnpm lint         # eslint . (excludes src/components/ui/**)
pnpm build        # tsc -b && vite build
pnpm preview      # static serve dist/
```

CI runs all four on every PR. Don't merge red builds.

## Git / PR flow

`main` is the deployable branch. **Don't push to `main` directly** — every
change goes through a PR. The `Deploy` workflow only fires on PR merge into
`main` (and manual `workflow_dispatch`); direct pushes are no-ops by design.

Suggested branch naming: `feat/...`, `fix/...`, `chore/...`, `docs/...`.

Conventional Commits for the merge-commit subject is preferred but not
enforced.

## What lives where

```
src/
├── app/                 # Layout, router
├── pages/               # One file per tool route
├── components/
│   └── ui/              # shadcn-managed; do not hand-edit
├── lib/
│   ├── tools.ts         # SOURCE OF TRUTH for tool registry
│   └── utils.ts         # cn() helper
├── hooks/               # custom hooks (none yet)
└── index.css            # Tailwind import + theme variables
```

## Deploy

A static deploy pipeline ships `dist/` to a Linux box behind Nginx — see
`.github/workflows/deploy.yml` for the build steps. The production server
must serve the COOP/COEP headers documented above (it does); SPA-style
fallback to `index.html` is also a hard requirement.

Per-environment infrastructure details (hostname, webroot path, SSH config)
are intentionally **not** documented in this public repo. They live in the
maintainer's local notes.
