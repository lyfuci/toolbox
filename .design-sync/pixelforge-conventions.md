# PixelForge — Photoshop-style web UI kit

The toolbox image editor's **pro-tool UI**, as a design system: menu/options/tool
bars, dockable panels (Layers, Properties, History…), and the full set of CC-style
modal dialogs. It is a **separate kit from the base Toolbox primitives** but built
on top of them (it composes Button/Dialog/Label internally) and shares the same
zinc/dark tokens, plus a dedicated **`.pf-*` chrome layer**. Every component is a
real compiled export on `window.PixelForge`.

## Setup (do this first)

- **Dark only.** PixelForge mirrors the editor, which runs in permanent dark mode.
  Put `class="dark"` on the design root (or `html`). There is **no light variant**
  and **no React provider** to wire.
- **i18n is pre-wired.** Components are localized with react-i18next; the bundle
  self-initializes English on load, so `t()` renders real copy with zero setup.
  Switch languages with `i18n.changeLanguage('zh-CN')` after adding that resource.
- Modal dialogs portal to `<body>`; the root `.dark` makes them dark automatically.

## The `.pf-*` chrome vocabulary

Tokens/utilities are the **same semantic set as the base Toolbox kit** (`bg-card`,
`text-muted-foreground`, `border-input`, `rounded-*`, the `var(--*)` tokens — and
the same build-snapshot caveat: use `var(--token)` / inline styles for any utility
not already in `styles.css`). On top of that, PixelForge adds these chrome classes
(all defined in `styles.css`'s `@import`ed `_ds_bundle.css`):

- **Shell / layout:** `pf-root`, `pf-shell`, `pf-canvas-area`, `pf-canvas-wrap`, `pf-right`
- **Menu bar:** `pf-menubar`, `pf-menubar-name`, `pf-menu-item`, `pf-menu-dd`, `pf-menu-backdrop`
- **Options bar:** `pf-options`, `pf-opt-group`, `pf-opt-label`, `pf-opt-input`, `pf-opt-select`, `pf-opt-btn`
- **Tools rail:** `pf-tools`, `pf-tool-group`, `pf-tool-btn`, `pf-tool-colors`, `pf-tool-sep`
- **Panels:** `pf-panel-group`, `pf-panel-tabs`, `pf-panel-tab`, `pf-panel-body`, `pf-scroll-y`
- **Layer rows:** `pf-layer-row`, `pf-layer-selected`, color tags `pf-tone-blue|neutral|warm`
- **Status bar:** `pf-statusbar` · **Context menu:** `pf-context-menu`, `pf-context-menu-item`, `pf-context-menu-sep`, `pf-context-menu-header`, `pf-context-menu-shortcut`, `pf-context-menu-danger`
- **Misc:** `pf-kbd`, `pf-active`, `pf-disabled`, `pf-open`, `pf-sep`

## Props are editor-shaped — read the per-component docs

Unlike the base primitives, these are app-internal components: their props are the
editor's own data (an `EditorState`, a `layers` array, a `handlers` object of
callbacks, an `open` flag for dialogs). The emitted `<Name>.d.ts` are therefore
**intentionally loose** (an index signature, not a hand-modelled interface) — so
**read each component's `<Name>.prompt.md`, which embeds a working preview with
realistic props**, rather than trusting the `.d.ts` shape. Dialogs render via an
`open` prop (or an open-key string); panels take plain data objects + noop-able
callbacks.

## A typical editor layout

```
pf-root
├── MenuBar              (handlers={…})            — File/Edit/Image/Select/Filter/Layer/View
├── OptionsBar           (tool="brush" …)          — context-sensitive tool options
└── pf-shell
    ├── ToolsPalette     (tool, setTool, fg/bg)    — vertical tool rail
    ├── pf-canvas-area   (your <canvas>)           — NOT in this kit (app-owned)
    └── pf-right
        ├── LayersPanel  (state, selectedId, …)
        ├── PropertiesPanel · HistoryPanel · ActionsPanel · PathsPanel · …
StatusBar                (dimensions, zoom, tool…) — bottom bar
```

Modal dialogs (New Document, Image/Canvas Size, Fill, Stroke, Adjustment, Filter,
Layer Style, Warp Text, Rotate, Select Modify, Color Picker, Shortcuts) mount over
that shell when opened. `SaveForWebDialog` ships as a floor card — its chrome is
real but its live `<canvas>` preview needs the running editor.

## Idiomatic snippet

```tsx
import { LayersPanel } from 'toolbox' // resolves to window.PixelForge

export default function Panels() {
  return (
    <div className="dark" style={{ background: 'var(--background)', color: 'var(--foreground)', padding: 16, width: 280 }}>
      <LayersPanel
        state={{ imageLayer: { kind: 'image', id: 'image', name: 'Background', visible: true, opacity: 100, blend: 'normal' },
          layers: [{ kind: 'annotation', id: 'l1', name: 'Headline', visible: true, opacity: 100, blend: 'normal', colorTag: 'blue', shape: { kind: 'text', x: 40, y: 60, text: 'Summer Sale', color: '#fff', fontSize: 48 } }],
          transforms: { rotation: 0, flipH: false, flipV: false },
          adjust: { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, blur: 0, hue: 0, sepia: 0, invert: 0 } }}
        selectedId="l1" onSelect={() => {}} setLayers={() => {}} patchLayer={() => {}}
        patchImageLayer={() => {}} deleteLayer={() => {}} onOpenStyle={() => {}}
        renamingId={null} onStartRename={() => {}} onCommitRename={() => {}} onSetColorTag={() => {}}
      />
    </div>
  )
}
```
