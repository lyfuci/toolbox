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

---

# PixelForge kit (second design system)

A SECOND, separate design system for the image editor's Photoshop-style web UI,
uploaded to the **"PixelForge — Image Editor UI Kit"** Claude Design project
(projectId in `pixelforge.config.json`). Built from the SAME repo with a parallel
config; the base shadcn kit is unaffected.

- **Config:** `pixelforge.config.json` (globalName `PixelForge`, out dir `pf-bundle`,
  entry `pixelforge-entry.ts`, conventions `pixelforge-conventions.md`).
- **Shape:** synth-entry, same as base. `srcDir = src/components/image-editor`.
- **cssEntry:** `cat dist/assets/index-*.css dist/assets/ImageEditor-*.css >
  .design-sync/.cache/pixelforge.css` — the editor's `pixelforge.css` (`.pf-*`
  chrome) lives in the ImageEditor route chunk, so BOTH app CSS chunks are needed.
  Re-sync must rebuild (`pnpm build`) then re-cat before the converter.
- **i18n:** editor components use `react-i18next` `t()`. `pixelforge-entry.ts`
  self-initializes the global i18n instance in English (no provider needed) so
  components render real copy. To add zh-CN, merge that resource in the entry.
- **Dark:** previews set `html.dark` (Frame `useEffect`) so portaled dialogs are
  dark too — the editor is dark-only.
- **dtsPropsFor: intentionally NOT written** for this kit — 30 app-internal
  components with editor-shaped props (EditorState/LayerEffect[]/handlers) would
  be very costly + error-prone to hand-model. The `.d.ts` ship as loose index
  signatures; usage is carried by each `<Name>.prompt.md` (embeds the authored
  preview) + the conventions header. Add dtsPropsFor in a later re-sync if needed.
- **Scope:** 28 audited SYNC + 2 smoke = 30 synced. SKIPPED (need live canvas/
  pixels/state): Canvas, Workspace, RightSidebar, ChannelsPanel, ReplaceColorDialog,
  ColorRangeDialog. **SaveForWebDialog** ships as a FLOOR CARD (its live <canvas>
  preview can't paint without the running editor; chrome is real).
- **Shared dirs:** previews live in the shared `.design-sync/previews/` (disjoint
  names from the base kit — safe; the other kit's build only warns "stale preview"
  and never deletes). Always pass `--components` on pf captures so an unscoped run
  can't prune the base kit's grades.
- **Re-sync:** `node .ds-sync/resync.mjs --config .design-sync/pixelforge.config.json
  --node-modules ./node_modules --out ./pf-bundle` (first sync omits --remote), with
  `DS_CHROMIUM_PATH=/usr/bin/google-chrome`.

## PixelForge re-sync risks
- Source bug noticed during the sync: a `Duplicate key "toolHint"` esbuild warning
  (a duplicate object key somewhere in the editor source) — non-fatal, but worth
  fixing in the app.

### ⚠ Self-check fails at PixelForge's scale — manual manifest required

**Symptom:** after a normal upload, the claude.ai/design server-side self-check
(which compiles the `@dsCard` markers into `_ds_manifest.json` and renders the
DS pane) **silently fails** for PixelForge — `_ds_manifest.json` / `.thumbnail`
/ `_adherence.oxlintrc.json` never appear, so the pane shows no components. The
base kit (12 components / 475K bundle / 68 files) self-checks fine; PixelForge
(30 components / 732K bundle / 157 files) does not, and this larger project also
throws intermittent `503 "overflow"` on the file API. It's a SCALE limit, not a
content problem (all markers/CSS/bundle verified correct).

**Workaround (confirmed working — the pane reads `_ds_manifest.json` directly):**
after the normal upload, generate the manifest from the uploaded cards and push
it yourself, then DELETE the sentinel so the failing self-check can't re-trigger
and wipe it:

1. Build `pf-bundle/_ds_manifest.json` from the cards — namespace `PixelForge`,
   `components[]` = {name, sourcePath:`components/<group>/<Name>/<Name>.jsx`},
   `cards[]` = {path:`…/<Name>.html`, group, viewport} parsed from each html's
   first-line `@dsCard` comment, `globalCssPaths:["_ds_bundle.css","styles.css"]`,
   `themes:[{selector:"html.dark",label:"Dark"}]`, empty tokens/templates/fonts,
   `source:"design-sync-cli"`. (Tokens can be empty — they only feed the token
   tab, not the component cards.)
2. `finalize_plan` writes:`["_ds_manifest.json"]` deletes:`["_ds_needs_recompile"]`,
   `write_files` the manifest, `delete_files` the sentinel.

**Re-sync must redo step 1–2** every time (the converter can't emit the manifest
— it's normally app-generated). If the manifest ever stops rendering, the
fallback is to split PixelForge into two smaller projects (~15 each, matching the
base kit's working profile) so the self-check succeeds natively.
