# design-sync notes (Toolbox Design System)

Repo-specific gotchas for `/design-sync`. The toolbox is an **app, not a
component library** — these notes exist because the sync runs in an
unusual shape.

## Shape: synth-entry package (no library dist)

- `package.json` is `private`, no `main`/`module`/`exports`. There is **no
  buildable component-library entry**, so the converter runs in
  **synth-entry mode** off `componentSrcMap` (the 12 `src/components/ui/*`
  files), with `tsconfig: tsconfig.json` so esbuild resolves the `@/` alias
  (→ `src/lib/utils` `cn`).
- The 12 components are **stock shadcn/ui** (new-york, zinc), customized only
  through the Tailwind v4 theme tokens. The bespoke value of this sync is the
  **theme + composition idiom** (see `conventions.md`), not the primitives.

## CSS: the app's own compiled stylesheet

- Components carry **no static CSS of their own** — styling is Tailwind v4
  utility classes compiled at build time by `@tailwindcss/vite`. So the
  shipped stylesheet is the **app's built CSS**, which contains the
  `:root`/`.dark` token blocks + every utility used app-wide (a verified
  superset of all 12 components' classes, including app-unused cva variants).
- `buildCmd` = `pnpm build`. After it runs, the hashed `dist/assets/index-*.css`
  is copied to `.design-sync/.cache/app.css` (the `cssEntry`). **Re-sync must
  rebuild the app and refresh that copy** before running the converter:
  `pnpm build && cp dist/assets/index-*.css .design-sync/.cache/app.css`.

## Theme / dark mode

- App is **dark-by-default** (`html.dark` set in `src/main.tsx`). The built
  CSS ships both themes: light at `:root`, dark under `.dark`.
- Preview cards are wrapped in `.dark bg-background` so they match the
  deployed app the user actually sees.
- Designs the claude.ai agent builds receive only `styles.css`'s import
  closure (a **static snapshot** — no live Tailwind). They render **light by
  default** unless wrapped in `class="dark"`. The conventions header documents
  the `.dark` wrapper prominently.

## Preview authoring conventions (calibrated from the solo set)

- Each `previews/<Name>.tsx` imports components from `'toolbox'` (resolves to
  `window.Toolbox` — all 44 exports, incl. sub-parts like `CardHeader`,
  `TooltipProvider`, and the `toast` fn). Icons: `lucide-react` with the
  **`*Icon` suffix** (e.g. `MailIcon`, `PlusIcon`) — this lucide version uses
  that naming (see `dialog.tsx` `XIcon`).
- Wrap each cell in a `.dark` frame so it matches the deployed (dark) app.
  The frame uses **inline styles** for the theme so it never depends on a
  utility class that might be tree-shaken from the build-snapshot CSS:
  `className="dark"` + `style={{ background:'var(--background)',
  color:'var(--foreground)', colorScheme:'dark', padding:24, ... }}`. Layout
  glue (flex/grid/gap) is inline too.
- **Portaled content (Dialog, Tooltip) escapes the frame** — it mounts on
  `<body>`, which inherits the page's light-vars `color` (near-black). So the
  text renders invisible on the dark surface unless you put both `className="dark"`
  **and** `style={{ color:'var(--foreground)' }}` on the portaled element
  (DialogContent / TooltipContent). Setting `.dark` alone only redefines the
  CSS vars, not the inherited `color` property. For a dark backdrop behind a
  Dialog, render a `fixed inset-0` `.dark` div in the root mount (the portal
  layers above it).
- Overlays get `cfg.overrides.<Name>: { cardMode:"single", viewport:"WxH" }`
  and render open (`defaultOpen`).

## Render check / capture — chromium

- The render check (`package-validate.mjs`) and `package-capture.mjs` need
  playwright + chromium. Installed `playwright@1.59.1` in `.ds-sync`, but its
  pinned chromium build (1217) is **not** in `~/.cache/ms-playwright/` (only
  1208 is). Rather than download, **point at system Chrome**:
  `DS_CHROMIUM_PATH=/usr/bin/google-chrome` in front of every validate/capture
  command. This env var is the validator/capture's supported override.
- On a fresh machine, either `npx playwright install chromium` (matching the
  installed playwright version) or set `DS_CHROMIUM_PATH` to any recent Chrome.

## Known render warns (benign — don't re-chase)

- `[RENDER_THIN] components/feedback/Toaster/Toaster.html: rendered height 0px`
  — the Toaster mounts a region and the toasts are portaled/fixed, so the root
  measures 0. The toasts DO render (success/error/default with richColors,
  dark theme) — confirmed in `_screenshots/review/feedback__Toaster.png`.
  Graded `good`. A re-sync seeing only this warn should treat it as known.

## Re-sync risks

- **CSS is a build snapshot.** Any Tailwind utility the design agent invents
  that isn't already in the app's CSS renders unstyled. Not fixable by a
  bigger dump — it's a documentation job (conventions header tells the agent
  to compose with the provided components + documented token utilities).
- **Dark-default is deferred, deliberately.** Designs default to light unless
  `.dark`-wrapped. If the online result looks wrong (user is dark-first and
  only checks online), flip by promoting the `.dark` token values to `:root`
  in the shipped CSS and re-upload — cheap, one-file change.
- **Synth-entry `.d.ts` are weaker** than a real library's. cva components
  (Button, Tabs) may need `dtsPropsFor` overrides — check the emitted
  `.d.ts` on every re-sync.
