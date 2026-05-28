import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AdjustmentDialog } from '@/components/image-editor/AdjustmentDialog'
import { Canvas, type CanvasHandle } from '@/components/image-editor/Canvas'
import { DropZone } from '@/components/image-editor/DropZone'
import { ShortcutsDialog } from '@/components/image-editor/ShortcutsDialog'
import { FillDialog } from '@/components/image-editor/FillDialog'
import { FilterDialog } from '@/components/image-editor/FilterDialog'
import { CanvasSizeDialog, type Anchor9 } from '@/components/image-editor/CanvasSizeDialog'
import { ColorPickerDialog } from '@/components/image-editor/ColorPickerDialog'
import { ContextMenu, type ContextMenuItem } from '@/components/image-editor/ContextMenu'
import { ImageSizeDialog } from '@/components/image-editor/ImageSizeDialog'
import { LayerStyleDialog } from '@/components/image-editor/LayerStyleDialog'
import { WarpTextDialog } from '@/components/image-editor/WarpTextDialog'
import { MenuBar } from '@/components/image-editor/MenuBar'
import { RotateArbitraryDialog } from '@/components/image-editor/RotateArbitraryDialog'
import { NewDocumentDialog } from '@/components/image-editor/NewDocumentDialog'
import { SaveForWebDialog } from '@/components/image-editor/SaveForWebDialog'
import { OptionsBar } from '@/components/image-editor/OptionsBar'
import { CROP_ASPECTS } from '@/lib/image-editor/crop-presets'
import { RightSidebar } from '@/components/image-editor/RightSidebar'
import {
  SelectModifyDialog,
  type SelectModifyKind,
} from '@/components/image-editor/SelectModifyDialog'
import { StatusBar } from '@/components/image-editor/StatusBar'
import { StrokeDialog } from '@/components/image-editor/StrokeDialog'
import { ToolsPalette } from '@/components/image-editor/ToolsPalette'
import { STUB_TOOLS } from '@/components/image-editor/tool-meta'
import { Workspace, type WorkspaceHandle } from '@/components/image-editor/Workspace'
import '@/components/image-editor/pixelforge.css'
import {
  buildImageShapeLayer,
  buildSmartObject,
  extractRegion,
  flattenToDataUrl,
  mergeLayersToImageLayer,
  previewDimsOf,
  rasterizeLayer,
  regionFromSelection,
  renderEditorToCanvas,
} from '@/lib/image-editor/composite-ops'
import {
  loadCustomBrushPresets,
  saveCustomBrushPresets,
  type BrushPreset,
} from '@/lib/image-editor/brush-presets'
import {
  applyFilenamePattern,
  BUILTIN_EXPORT_PRESETS,
  loadExportPresets,
  type ExportPreset,
} from '@/lib/image-editor/export-presets'
import { DEFAULT_BRUSH_OPTIONS, DEFAULT_TEXT_OPTIONS, initialState, PREVIEW_MAX } from '@/lib/image-editor/defaults'
import { fillSelection, strokeSelection, type StrokePosition } from '@/lib/image-editor/edit-ops'
import { buildSelectionMaskCanvas } from '@/lib/image-editor/selection-mask'
import { smoothSelection, growSelection, rasterizePolygonMask } from '@/lib/image-editor/selection-modify'
import { selectSubject } from '@/lib/image-editor/select-subject'
import { ColorRangeDialog } from '@/components/image-editor/ColorRangeDialog'
import { ReplaceColorDialog } from '@/components/image-editor/ReplaceColorDialog'
import { applyLiquifyBrush, type LiquifyMode } from '@/lib/image-editor/liquify-warp'
import { floodFillMask, maskToDataUrl } from '@/lib/image-editor/flood-fill'
import { useHistoryState } from '@/lib/image-editor/history'
import {
  addRecentFile,
  loadRecentFiles,
  makeThumbnail,
  type RecentFile,
} from '@/lib/image-editor/recent-files'
import {
  clearAutosave,
  loadAutosave,
  saveAutosave,
} from '@/lib/image-editor/autosave'
import { useActionHandlers } from '@/lib/image-editor/hooks/useActionHandlers'
import { useBrushTipImport } from '@/lib/image-editor/hooks/useBrushTipImport'
import { extractMaskContour } from '@/lib/image-editor/mask-contour'
import {
  makeWorkPathLayer,
  selectionFromPath,
} from '@/lib/image-editor/path-selection-ops'
import {
  combineRectSelection,
  combinePathSelection,
  type SelectionModifier,
} from '@/lib/image-editor/selection-combine'
import { fileToDataUrl, useImageCache } from '@/lib/image-editor/image-cache'
import type { ImageCache } from '@/lib/image-editor/drawing'
import {
  deepCloneLayerWithNewIds,
  findLayerById,
  findLayerPath,
  getLayerAtPath,
  insertAtPath,
  isGroup,
  mapLayerById,
  removeLayerById,
  reorderSibling,
  walkLayers,
} from '@/lib/image-editor/layer-tree'
import { getLayerBBox } from '@/lib/image-editor/hit'
import { dimsAfterRotation, renderTo } from '@/lib/image-editor/render'
import {
  contractSelection,
  deselect,
  expandSelection,
  inverseSelection,
  reselect,
  selectAll,
} from '@/lib/image-editor/selection-ops'
import { scaleLayer, translateLayer, withSelectionClip } from '@/lib/image-editor/transform'
import {
  loadImageFromUrl,
  parseProject,
  serializeProject,
} from '@/lib/image-editor/serialize'
import type {
  AdjustmentKind,
  AdjustmentLayer,
  AdjustmentParams,
  AnnotationLayer,
  BrushOptions,
  EditorState,
  FilterKind,
  FilterLayer,
  FilterParams,
  GroupLayer,
  Layer,
  LayerEffect,
  LayerEffectKind,
  OutputFormat,
  SmartSource,
  TextOptions,
  TextShape,
  TextWarp,
  Point,
  Rect,
  ReplaceColorParams,
  Tool,
  Transforms,
} from '@/lib/image-editor/types'

/** Identity warp — used to seed the Warp Text dialog for un-warped text. */
const NONE_WARP: TextWarp = { style: 'none', bend: 0, horizontal: 0, vertical: 0 }

/**
 * Compact relative-time formatter ("5m ago", "2h ago", "3d ago"). Used by
 * the autosave-restore banner so the user sees how stale the snapshot is.
 * Falls back to a date string for entries older than a week.
 */
function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms) || ms < 0) return iso
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

/**
 * Recursive layer counter — includes group children. Used by the status
 * bar's "layers: N" readout so groups don't undercount.
 */
function countAllLayers(layers: Layer[]): number {
  let n = 0
  for (const l of layers) {
    n++
    if (l.kind === 'group') n += countAllLayers(l.children)
  }
  return n
}

/** Axis-aligned bbox of a polygon. */
function bboxOfPath(path: Point[]): Rect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of path) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** Materialize a 4-point polygon from a rect selection (Smooth needs a path). */
function rectToPath(rect: Rect | undefined): Point[] | null {
  if (!rect || rect.w === 0 || rect.h === 0) return null
  const x0 = Math.min(rect.x, rect.x + rect.w)
  const y0 = Math.min(rect.y, rect.y + rect.h)
  const x1 = x0 + Math.abs(rect.w)
  const y1 = y0 + Math.abs(rect.h)
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
}

/**
 * Image editor page (PixelForge shell).
 *
 * Layout — a 4-row × 3-col CSS grid (`pf-shell`):
 *
 *   ┌──────────────────────────────────┐
 *   │  menu bar                        │
 *   ├──────────────────────────────────┤
 *   │  options bar (context-sensitive) │
 *   ├──────┬───────────────────┬───────┤
 *   │tools │ tab strip + canvas│ panels│
 *   │ rail │                   │ right │
 *   ├──────┴───────────────────┴───────┤
 *   │  status bar                      │
 *   └──────────────────────────────────┘
 *
 * Drawing/state lives in the existing Canvas/Workspace; the new shell
 * components (MenuBar, OptionsBar, ToolsPalette, RightSidebar, StatusBar)
 * are pure presentational layers that wire into the same state. Tools that
 * aren't yet implemented are rendered in the palette as "stub" buttons —
 * they don't change tool state; clicking surfaces a toast.
 */
export function ImageEditorPage() {
  const { t } = useTranslation()

  // History-tracked editor state.
  const history = useHistoryState<EditorState>(initialState())
  const state = history.state

  // Non-history: image bitmap, filename, UI prefs.
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [filename, setFilename] = useState('image')

  const [tool, setTool] = useState<Tool>('none')
  const [colors, setColors] = useState({ fg: '#ef4444', bg: '#ffffff' })
  const swapColors = useCallback(
    () => setColors((c) => ({ fg: c.bg, bg: c.fg })),
    [],
  )
  const resetColors = useCallback(
    () => setColors({ fg: '#000000', bg: '#ffffff' }),
    [],
  )
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [brushOptions, setBrushOptions] = useState<BrushOptions>(DEFAULT_BRUSH_OPTIONS)
  const [textOptions, setTextOptions] = useState<TextOptions>(DEFAULT_TEXT_OPTIONS)
  const [customBrushPresets, setCustomBrushPresets] = useState<BrushPreset[]>(() =>
    loadCustomBrushPresets(),
  )
  const [cropAspectId, setCropAspectId] = useState<string>('free')
  // Hoisted up so the Ctrl+N keyboard handler (declared above its handler
  // function below) compiles without a "used before declared" lint flag.
  const [newDocOpen, setNewDocOpen] = useState(false)
  const [bucketTolerance, setBucketTolerance] = useState(32)
  const [wandTolerance, setWandTolerance] = useState(32)
  // Selection tool options (transient UI state, not document history). PS-style
  // boolean mode (新建/加/减/交) is the *base* combine mode; Shift/Alt held at
  // draw time still override it. `featherOption` is the feather radius (preview
  // px) baked onto newly-drawn selections — Select > Modify > Feather edits the
  // current selection's `state.selectionFeather` instead.
  const [selectionMode, setSelectionMode] = useState<SelectionModifier>('replace')
  const [featherOption, setFeatherOption] = useState(0)
  // Clone Stamp source point — set by Alt+click while the Stamp tool is
  // active, cleared whenever the user switches away from Stamp (handled in
  // trySetTool). Lives outside EditorState because it's transient UI state.
  const [cloneSource, setCloneSource] = useState<Point | null>(null)
  // Liquify session — when the user enters the Liquify tool, we snapshot the
  // composite into this canvas. Each brush stamp warps it in place (no React
  // re-render needed; the Canvas component reads the ref each draw). Apply
  // commits the canvas's pixels as an image-shape layer; Cancel/tool-switch
  // discards it. Tool options below are transient UI state — they don't push
  // history (history fires only on Apply, like Quick Mask).
  const [liquifyCanvas, setLiquifyCanvas] = useState<HTMLCanvasElement | null>(null)
  // Identity of `liquifyCanvas` is stable across stamps (we mutate it in
  // place), so the Canvas component needs a separate trigger to re-render
  // after each stamp. Bumping this tick on each stamp does exactly that.
  const [liquifyTick, setLiquifyTick] = useState(0)
  const [liquifyMode, setLiquifyMode] = useState<LiquifyMode>('push')
  const [liquifySize, setLiquifySize] = useState(60)
  const [liquifyStrength, setLiquifyStrength] = useState(50) // %
  const [selectedLayerId, setSelectedLayerId] = useState<string>('image')

  const [outFormat, setOutFormat] = useState<OutputFormat>('png')
  const [outQuality, setOutQuality] = useState<number>(92)
  // Export presets: built-ins are always present + user-defined ones
  // loaded once from localStorage. Edits to user presets happen elsewhere
  // (future preset editor); the menu just reads from this list.
  const [exportPresets] = useState<ExportPreset[]>(() => [
    ...BUILTIN_EXPORT_PRESETS,
    ...loadExportPresets(),
  ])

  const [focused, setFocused] = useState(false)
  // Cursor coords in preview-pixel space, mirrored from Canvas's onCursorMove.
  // Used for the status bar's live readout; cleared on canvas leave.
  const [cursor, setCursor] = useState<Point | null>(null)
  // Mirrored from Canvas to drive the OptionsBar's Apply / Cancel buttons
  // (so users don't need to know about Enter / Esc).
  const [cropPending, setCropPending] = useState(false)
  // Recent files — File > Open Recent submenu. Persisted via localStorage.
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => loadRecentFiles())
  // Autosave-recovery banner shows when an unsaved snapshot exists on mount.
  // Cleared once the user accepts or dismisses; null = no offer pending.
  // Initialized lazily from localStorage so the banner renders on first paint
  // without a follow-up setState (which the lint rule against setState-in-
  // effect would flag).
  const [autosaveRestore, setAutosaveRestore] = useState<ReturnType<typeof loadAutosave>>(() => loadAutosave())
  // `?` key opens the shortcut cheat sheet modal.
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const canvasRef = useRef<CanvasHandle | null>(null)
  const workspaceRef = useRef<WorkspaceHandle | null>(null)

  const { cache: imageCache, ensure: ensureImage } = useImageCache()

  // Ensure embedded dataUrls (raster Layer Masks + Pattern Overlay
  // patterns) are loaded into the imageCache so the renderer can resolve
  // them synchronously. ensureImage dedupes via an inflight map so seen
  // dataUrls don't re-fetch.
  useEffect(() => {
    for (const l of walkLayers(state.layers)) {
      if (l.kind === 'mask' && l.dataUrl) {
        ensureImage(l.dataUrl).catch(() => {})
      }
      if (
        (l.kind === 'adjustment' || l.kind === 'filter') &&
        l.maskDataUrl
      ) {
        ensureImage(l.maskDataUrl).catch(() => {})
      }
      if (l.kind === 'annotation' && l.shape.kind === 'brush' && l.shape.tipDataUrl) {
        ensureImage(l.shape.tipDataUrl).catch(() => {})
      }
      for (const fx of l.effects ?? []) {
        if (fx.kind === 'patternOverlay' && fx.patternDataUrl) {
          ensureImage(fx.patternDataUrl).catch(() => {})
        }
      }
    }
    if (state.quickMask) {
      ensureImage(state.quickMask.dataUrl).catch(() => {})
    }
  }, [state.layers, state.quickMask, ensureImage])

  // Custom brush tip (set by BrushesPanel / persisted in localStorage). The
  // tip lives on brushOptions, not in state.layers, so the layer-walker
  // effect above won't pick it up — make sure it's in the cache before the
  // first stroke commits.
  const brushTipDataUrl = brushOptions.tipDataUrl
  useEffect(() => {
    if (brushTipDataUrl) ensureImage(brushTipDataUrl).catch(() => {})
  }, [brushTipDataUrl, ensureImage])

  // On mount, surface any autosave snapshot via lazy useState init so the
  // initial render already reflects the offer — avoids the lint rule
  // against setState-in-effect and removes a needless re-render.
  // (Performed in the useState initializer above.)

  // Periodic autosave (every 30s) while a document is open. The snapshot
  // captures the bound image's dataUrl + the full EditorState — same
  // shape Save Project produces, so it can be loaded back via the
  // existing parseProject helper.
  useEffect(() => {
    if (!image) return
    const tick = async () => {
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const c = document.createElement('canvas')
          c.width = image.naturalWidth
          c.height = image.naturalHeight
          const ctx = c.getContext('2d')
          if (!ctx) return reject(new Error('no ctx'))
          ctx.drawImage(image, 0, 0)
          resolve(c.toDataURL('image/png'))
        })
        saveAutosave({ source: { name: filename, dataUrl }, state })
      } catch {
        // Silent — autosave is best-effort.
      }
    }
    const id = window.setInterval(tick, 30000)
    return () => window.clearInterval(id)
  }, [image, filename, state])

  // Actions panel state + handlers — bundled into a custom hook to keep
  // this top-level component focused on orchestration.
  const actionHandlers = useActionHandlers(state, history, t)

  const duplicateRef = useRef<() => void>(() => {})
  const moveLayerRef = useRef<(d: 'forward' | 'backward' | 'front' | 'back') => void>(() => {})
  const deleteLayerRef = useRef<() => void>(() => {})
  const groupRef = useRef<() => void>(() => {})
  const ungroupRef = useRef<() => void>(() => {})
  const selectAllRef = useRef<() => void>(() => {})
  const deselectRef = useRef<() => void>(() => {})
  const reselectRef = useRef<() => void>(() => {})
  const inverseSelectionRef = useRef<() => void>(() => {})
  const cutRef = useRef<() => void>(() => {})
  const copyRef = useRef<() => void>(() => {})
  const copyMergedRef = useRef<() => void>(() => {})
  const pasteRef = useRef<() => void>(() => {})
  const pasteInPlaceRef = useRef<() => void>(() => {})
  const mergeDownRef = useRef<() => void>(() => {})
  const mergeVisibleRef = useRef<() => void>(() => {})
  const stampVisibleRef = useRef<() => void>(() => {})
  const clippingMaskRef = useRef<() => void>(() => {})
  const saveProjectRef = useRef<() => void>(() => {})
  const quickMaskToggleRef = useRef<() => void>(() => {})

  // View menu toggles (UI-only, not part of EditorState or project save).
  // Grid + snap travel together: snap is a no-op when the grid is hidden.
  const [showGrid, setShowGrid] = useState(false)
  const [snapToGrid, setSnapToGrid] = useState(false)
  // View > Rulers + Guides — rulers off by default (PS default), guides on so
  // existing-document guides are visible the moment a user opens a saved file.
  const [showRulers, setShowRulers] = useState(false)
  const [showGuides, setShowGuides] = useState(true)
  // gridStep is a constant in v1; a follow-up will expose it via a settings
  // popover next to the View menu toggle.
  const gridStep = 50 // preview-canvas pixels

  // Zoom + pan + Space-held pan mode.
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [panMode, setPanMode] = useState(false)
  // Effective pan: Space held OR Hand tool active. Workspace + Canvas both
  // route mouse drags to panning when this is true.
  const effectivePanMode = panMode || tool === 'hand'
  /**
   * View-only canvas rotation in degrees (0 / 90 / 180 / 270). Lives outside
   * EditorState because it doesn't affect pixels — just how the canvas is
   * displayed in the workspace. Cycled by the Rotate View tool (R).
   */
  const [viewRotation, setViewRotation] = useState<0 | 90 | 180 | 270>(0)

  const ZOOM_MIN = 0.1
  const ZOOM_MAX = 8
  const ZOOM_STEP = 1.25
  const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))
  const zoomIn = useCallback(() => setZoom((z) => clampZoom(z * ZOOM_STEP)), [])
  const zoomOut = useCallback(() => setZoom((z) => clampZoom(z / ZOOM_STEP)), [])
  const zoomReset = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])
  // View > Actual Pixels (⌘1): zoom = 1, pan reset. Distinct from Fit on
  // Screen — actual pixels gives a 1:1 source-pixel view.
  const zoomActualPixels = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])
  // View > Fit on Screen (⌘0): compute zoom so the canvas fits inside the
  // workspace's wrapper rect (with a 24px breathing margin), then centre.
  const zoomFitScreen = useCallback(() => {
    if (!image) return
    const rect = workspaceRef.current?.getWrapperRect()
    if (!rect) return
    const margin = 24
    const baseW = image.naturalWidth
    const baseH = image.naturalHeight
    const fitX = (rect.width - margin * 2) / baseW
    const fitY = (rect.height - margin * 2) / baseH
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(fitX, fitY)))
    setZoom(z)
    setPan({ x: 0, y: 0 })
  }, [image])

  const zoomAtPoint = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      setZoom((z0) => {
        const z1 = clampZoom(z0 * factor)
        const realFactor = z1 / z0
        if (realFactor === 1) return z0
        const rect = workspaceRef.current?.getWrapperRect()
        if (rect) {
          const cx = rect.left + rect.width / 2
          const cy = rect.top + rect.height / 2
          setPan((p) => ({
            x: p.x + (clientX - cx) * (1 - realFactor),
            y: p.y + (clientY - cy) * (1 - realFactor),
          }))
        }
        return z1
      })
    },
    [],
  )

  // Stub-tool toast — also surfaced when a stub-tool keyboard shortcut fires.
  const stubMsg = useCallback(
    (toolName: string) =>
      toast.message(t('pages.imageEditor.toolStubToast', { tool: toolName })),
    [t],
  )

  // Try to set tool; if it's in the stub set, show a toast and don't change
  // state. Rotate View doesn't have a tool mode — it's a one-shot action that
  // cycles the workspace rotation 0 → 90 → 180 → 270 → 0 each time clicked.
  const trySetTool = useCallback(
    (next: Tool) => {
      if (next === 'rotateView') {
        setViewRotation((r) => ((r + 90) % 360) as 0 | 90 | 180 | 270)
        return
      }
      if (STUB_TOOLS.has(next)) {
        stubMsg(t(`pages.imageEditor.tool.${next}`))
        return
      }
      setTool(next)
      // Leaving the Clone Stamp tool drops any stale source so re-entering
      // doesn't surprise the user with a sample point from minutes ago.
      if (next !== 'stamp') setCloneSource(null)
      // Liquify: entering snapshots the composite into the working canvas;
      // leaving with an unapplied session in flight discards it (same pattern
      // as Crop). The handler is defined later in the component, so we
      // forward through a ref (same mechanism as `duplicateRef` etc.).
      if (next === 'liquify') liquifyEnterRef.current()
      else if (liquifyCanvas) setLiquifyCanvas(null)
    },
    [stubMsg, t, liquifyCanvas],
  )
  const liquifyEnterRef = useRef<() => void>(() => {})

  // ── Global keyboard shortcuts (PS-style) ────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.code === 'Space' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        setPanMode(true)
        return
      }

      // `?` (Shift+/) opens the cheat sheet. We rely on `e.key === '?'`
      // which already includes the Shift modifier resolution.
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setShortcutsOpen((v) => !v)
        return
      }

      const mod = e.metaKey || e.ctrlKey
      if (mod) {
        if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn(); return }
        if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomOut(); return }
        if (e.key === '0') { e.preventDefault(); zoomFitScreen(); return }
        if (e.key === '1') { e.preventDefault(); zoomActualPixels(); return }
        if (e.key === 'j' || e.key === 'J') { e.preventDefault(); duplicateRef.current(); return }
        // Undo / redo. Ctrl+Z = undo; Ctrl+Shift+Z or Ctrl+Y = redo (PS conventions).
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault()
          if (e.shiftKey) history.redo()
          else history.undo()
          return
        }
        if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault()
          history.redo()
          return
        }
        // File menu shortcuts.
        if (e.key === 's' || e.key === 'S') {
          e.preventDefault()
          saveProjectRef.current()
          return
        }
        if (e.key === 'n' || e.key === 'N') {
          e.preventDefault()
          setNewDocOpen(true)
          return
        }
        if (e.key === 'o' || e.key === 'O') {
          e.preventDefault()
          replaceInputRef.current?.click()
          return
        }
        // Free Transform — currently only meaningful for Smart Objects
        // (which already expose the handle set via selection chrome).
        // Selecting the SO is enough; the hint surfaces via toast.
        if (e.key === 't' || e.key === 'T') {
          e.preventDefault()
          if (selectedLayerId && selectedLayerId !== 'image') {
            const sel = findLayerById(state.layers, selectedLayerId)
            if (sel?.kind === 'smartObject') {
              toast.message(t('pages.imageEditor.freeTransform.useSOHandles'))
            } else {
              toast.message(t('pages.imageEditor.freeTransform.onlySO'))
            }
          }
          return
        }
        // View menu toggles via shortcuts.
        if (e.key === "'") {
          e.preventDefault()
          setShowGrid((v) => !v)
          return
        }
        if (e.key === ';') {
          e.preventDefault()
          setSnapToGrid((v) => !v)
          return
        }
        if (e.key === ']') { e.preventDefault(); moveLayerRef.current(e.shiftKey ? 'front' : 'forward'); return }
        if (e.key === '[') { e.preventDefault(); moveLayerRef.current(e.shiftKey ? 'back' : 'backward'); return }
        if (e.key === 'g' || e.key === 'G') {
          // Cmd+G groups; Shift+Cmd+G ungroups; ⌥⌘G toggles clipping mask.
          e.preventDefault()
          if (e.altKey) clippingMaskRef.current()
          else if (e.shiftKey) ungroupRef.current()
          else groupRef.current()
          return
        }
        // Edit menu clipboard shortcuts.
        if (e.key === 'x' || e.key === 'X') {
          e.preventDefault()
          cutRef.current()
          return
        }
        if (e.key === 'c' || e.key === 'C') {
          e.preventDefault()
          if (e.shiftKey) copyMergedRef.current()
          else copyRef.current()
          return
        }
        if (e.key === 'v' || e.key === 'V') {
          e.preventDefault()
          if (e.shiftKey) pasteInPlaceRef.current()
          else pasteRef.current()
          return
        }
        // Layer menu merge shortcuts. PS conventions:
        //   ⌘E       — Merge Down
        //   ⇧⌘E      — Merge Visible
        //   ⌥⇧⌘E     — Stamp Visible (merge visible into NEW top layer, keep originals)
        if (e.key === 'e' || e.key === 'E') {
          e.preventDefault()
          if (e.shiftKey && e.altKey) stampVisibleRef.current()
          else if (e.shiftKey) mergeVisibleRef.current()
          else mergeDownRef.current()
          return
        }
        // Selection shortcuts: Cmd+A all, Cmd+D deselect (snapshots for
        // Reselect), Shift+Cmd+D reselect, Shift+Cmd+I inverse.
        if (e.key === 'd' || e.key === 'D') {
          e.preventDefault()
          if (e.shiftKey) reselectRef.current()
          else deselectRef.current()
          return
        }
        if (e.key === 'a' || e.key === 'A') {
          e.preventDefault()
          selectAllRef.current()
          return
        }
        if (e.key === 'i' || e.key === 'I') {
          if (e.shiftKey) {
            e.preventDefault()
            inverseSelectionRef.current()
            return
          }
        }
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedLayerId && selectedLayerId !== 'image') {
          e.preventDefault()
          deleteLayerRef.current()
          return
        }
      }

      // F intentionally NOT bound — Photoshop's F cycles screen modes; we leave
      // the key free for future PS-aligned behaviour. Focus mode is now toggled
      // via the green Fullscreen button in the top-right of the tab strip.
      // Rotate View — R cycles the workspace display rotation 0→90→180→270.
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        setViewRotation((r) => ((r + 90) % 360) as 0 | 90 | 180 | 270)
        return
      }
      // Quick Mask (PS: Q) — toggle pixel-paint selection mode. On enter
      // we rasterize the current selection into a dataUrl mask; on exit
      // we threshold it back to a bbox selection.
      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault()
        quickMaskToggleRef.current()
        return
      }
      if (e.key === 'Enter' && canvasRef.current?.hasPendingCrop()) {
        e.preventDefault()
        canvasRef.current.commitPendingCrop()
        return
      }
      if (e.key === 'Enter' && canvasRef.current?.hasPendingPen()) {
        e.preventDefault()
        canvasRef.current.commitPendingPen()
        return
      }
      if (e.key === 'Escape' && canvasRef.current?.hasPendingCrop()) {
        e.preventDefault()
        canvasRef.current.cancelPendingCrop()
        return
      }
      if (e.key === 'Escape' && canvasRef.current?.hasPendingPolyLasso()) {
        e.preventDefault()
        canvasRef.current.cancelPendingPolyLasso()
        return
      }
      if (e.key === 'Escape' && canvasRef.current?.hasPendingPen()) {
        e.preventDefault()
        canvasRef.current.cancelPendingPen()
        return
      }
      if (e.key === 'Escape' && focused) { e.preventDefault(); setFocused(false); return }
      if (e.key === 'x' || e.key === 'X') { e.preventDefault(); swapColors(); return }
      if (e.key === 'd' || e.key === 'D') { e.preventDefault(); resetColors(); return }

      // Tool shortcuts. PS-aligned: stub-tool shortcuts (M/L/W/J/S/Y/G/O/P/H)
      // surface a toast via trySetTool rather than silently doing nothing.
      const map: Record<string, Tool> = {
        v: 'none',
        m: 'marquee',
        l: 'lasso',
        w: 'wand',
        c: 'crop',
        i: 'eyedropper',
        j: 'spotHeal',
        b: 'brush',
        s: 'stamp',
        y: 'historyBrush',
        e: 'eraser',
        g: 'gradient',
        o: 'dodge',
        p: 'pen',
        t: 'text',
        u: 'rect',
        h: 'hand',
        z: 'zoom',
        a: 'arrowPath',
        n: 'note',
      }
      const next = map[e.key.toLowerCase()]
      if (next) {
        e.preventDefault()
        trySetTool(next)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setPanMode(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [focused, zoomIn, zoomOut, zoomReset, zoomActualPixels, zoomFitScreen, swapColors, resetColors, selectedLayerId, trySetTool, history, state, image, t])

  // ── Layer state helpers ──────────────────────────────────────────────────
  // All of these are tree-aware — `state.layers` is a nested tree once groups
  // are in play, so they delegate to layer-tree helpers rather than open-
  // coding the recursion inline.
  const setLayers = useCallback(
    (layers: Layer[]) => history.set({ ...state, layers }),
    [history, state],
  )
  const commitLayer = useCallback(
    (layer: Layer) => {
      const clipped = withSelectionClip(layer, state)
      // v1: newly-committed layers always land at the top of the top-level
      // stack. Users can drag them into a group from the panel afterwards.
      history.set({ ...state, layers: [...state.layers, clipped] })
      setSelectedLayerId(clipped.id)
    },
    [history, state],
  )
  const patchLayer = useCallback(
    (id: string, patch: Partial<Layer>) =>
      history.set({
        ...state,
        layers: mapLayerById(state.layers, id, (l) => ({ ...l, ...patch } as Layer)),
      }),
    [history, state],
  )
  const deleteLayer = useCallback(
    (id: string) => history.set({ ...state, layers: removeLayerById(state.layers, id) }),
    [history, state],
  )
  const patchImageLayer = useCallback(
    (patch: Partial<EditorState['imageLayer']>) =>
      history.set({ ...state, imageLayer: { ...state.imageLayer, ...patch } }),
    [history, state],
  )
  const commitLayerUpdate = useCallback(
    (id: string, layer: Layer) =>
      history.set({
        ...state,
        layers: mapLayerById(state.layers, id, () => layer),
      }),
    [history, state],
  )

  // Group / Ungroup actions, exposed via the Layer menu and Cmd+G shortcuts.
  const groupSelected = useCallback(() => {
    if (!selectedLayerId || selectedLayerId === 'image') return
    const path = findLayerPath(state.layers, selectedLayerId)
    if (!path) return
    const layer = findLayerById(state.layers, selectedLayerId)
    if (!layer) return
    const removed = removeLayerById(state.layers, selectedLayerId)
    const group: GroupLayer = {
      id: crypto.randomUUID(),
      name: t('pages.imageEditor.annoLabel.group'),
      visible: true,
      opacity: 100,
      blend: 'normal',
      kind: 'group',
      children: [layer],
      expanded: true,
    }
    history.set({ ...state, layers: insertAtPath(removed, path, group) })
    setSelectedLayerId(group.id)
  }, [history, selectedLayerId, state, t])

  const ungroupSelected = useCallback(() => {
    if (!selectedLayerId || selectedLayerId === 'image') return
    const layer = findLayerById(state.layers, selectedLayerId)
    if (!layer || !isGroup(layer)) return
    const path = findLayerPath(state.layers, selectedLayerId)
    if (!path) return
    const removed = removeLayerById(state.layers, selectedLayerId)
    // Splice children into the same position the group used to occupy.
    // Preserve child order so visual stacking is unchanged.
    let acc = removed
    for (let i = 0; i < layer.children.length; i++) {
      const childPath = [...path.slice(0, -1), path[path.length - 1] + i]
      acc = insertAtPath(acc, childPath, layer.children[i])
    }
    history.set({ ...state, layers: acc })
    setSelectedLayerId(layer.children[layer.children.length - 1]?.id ?? 'image')
  }, [history, selectedLayerId, state])

  const newGroup = useCallback(() => {
    const group: GroupLayer = {
      id: crypto.randomUUID(),
      name: t('pages.imageEditor.annoLabel.group'),
      visible: true,
      opacity: 100,
      blend: 'normal',
      kind: 'group',
      children: [],
      expanded: true,
    }
    history.set({ ...state, layers: [...state.layers, group] })
    setSelectedLayerId(group.id)
  }, [history, state, t])

  const selectedLayer = findLayerById(state.layers, selectedLayerId)
  const canGroupSelected = !!selectedLayer && selectedLayerId !== 'image'
  const canUngroupSelected = !!selectedLayer && isGroup(selectedLayer)
  // Type-on-Path is offered only when the selected layer is a vector PathShape
  // annotation — that's the only thing the renderer's `resolvePathSamples` can
  // walk.
  const canTypeOnPath =
    !!selectedLayer &&
    selectedLayer.kind === 'annotation' &&
    selectedLayer.shape.kind === 'path' &&
    selectedLayer.shape.anchors.length >= 2

  // Warp Text needs a plain text layer. Path-following text can't also warp
  // (the renderer's path placement wins), so exclude it.
  const canWarpText =
    !!selectedLayer &&
    selectedLayer.kind === 'annotation' &&
    selectedLayer.shape.kind === 'text' &&
    !selectedLayer.shape.followPathLayerId

  const handleTypeOnPath = useCallback(() => {
    const sel = findLayerById(state.layers, selectedLayerId)
    if (!sel || sel.kind !== 'annotation' || sel.shape.kind !== 'path') return
    // Anchor the text shape at the path's first anchor for sensible move/
    // select math; the actual glyph placement comes from path samples at
    // render time, so this (x, y) is just a convenient default origin.
    const first = sel.shape.anchors[0]
    const text = t('pages.imageEditor.typeOnPath.placeholder')
    commitLayer({
      id: crypto.randomUUID(),
      name: t('pages.imageEditor.typeOnPath.layerName'),
      visible: true,
      opacity: 100,
      blend: 'normal',
      kind: 'annotation',
      shape: {
        kind: 'text',
        x: first.x,
        y: first.y,
        text,
        color: colors.fg,
        fontSize: textOptions.fontSize,
        fontFamily: textOptions.fontFamily,
        fontWeight: textOptions.fontWeight,
        fontStyle: textOptions.fontStyle,
        align: 'left',
        followPathLayerId: sel.id,
      },
    })
  }, [state.layers, selectedLayerId, commitLayer, t, textOptions, colors.fg])

  // ── Warp Text ──────────────────────────────────────────────────────────
  // Warp edits an existing text layer's `shape.warp`. Live preview overlays a
  // warped copy onto the canvas via `displayState` (below) WITHOUT touching
  // history; Apply commits one history step via patchLayer; Cancel just drops
  // the preview. This keeps the undo stack to a single original→warped entry.
  const [warpTarget, setWarpTarget] = useState<{
    layerId: string
    initial: TextWarp
  } | null>(null)
  const [warpPreview, setWarpPreview] = useState<TextWarp | null>(null)

  const handleOpenWarpText = useCallback(() => {
    const sel = findLayerById(state.layers, selectedLayerId)
    if (!sel || sel.kind !== 'annotation' || sel.shape.kind !== 'text') return
    const init = sel.shape.warp ?? NONE_WARP
    setWarpTarget({ layerId: sel.id, initial: init })
    setWarpPreview(init)
  }, [state.layers, selectedLayerId])

  const handleWarpPreview = useCallback((warp: TextWarp) => {
    setWarpPreview(warp)
  }, [])

  const handleWarpApply = useCallback(
    (warp: TextWarp) => {
      if (warpTarget) {
        const finalWarp: TextWarp | undefined =
          warp.style === 'none' ? undefined : warp
        history.set({
          ...state,
          layers: mapLayerById(state.layers, warpTarget.layerId, (l) =>
            l.kind === 'annotation' && l.shape.kind === 'text'
              ? { ...l, shape: { ...(l.shape as TextShape), warp: finalWarp } }
              : l,
          ),
        })
      }
      setWarpTarget(null)
      setWarpPreview(null)
    },
    [warpTarget, history, state],
  )

  const handleWarpCancel = useCallback(() => {
    setWarpTarget(null)
    setWarpPreview(null)
  }, [])

  // Canvas render state with the live warp preview overlaid on the target text
  // layer (history untouched). Everything else — hit-testing, handles — keeps
  // using the real `state`, so selection stays on the layer's logical bbox.
  const displayState: EditorState = useMemo(() => {
    if (!warpTarget || !warpPreview) return state
    return {
      ...state,
      layers: mapLayerById(state.layers, warpTarget.layerId, (l) =>
        l.kind === 'annotation' && l.shape.kind === 'text'
          ? { ...l, shape: { ...(l.shape as TextShape), warp: warpPreview } }
          : l,
      ),
    }
  }, [state, warpTarget, warpPreview])

  // ── Selection menu handlers ───────────────────────────────────────────
  // `applySelection` merges a partial selection update into history. The
  // selection-ops helpers return empty objects to signal "no-op" (e.g.,
  // Reselect with no snapshot, Deselect with nothing selected) — bail in
  // that case so the no-op doesn't pollute the undo stack.
  const previewDims = (() => {
    if (!image) return { w: 0, h: 0 }
    const { baseW, baseH } = dimsAfterRotation(image, state)
    const ps = Math.min(1, PREVIEW_MAX / Math.max(baseW, baseH, 1))
    if (state.cropRect) {
      const r = state.cropRect
      return { w: Math.abs(r.w), h: Math.abs(r.h) }
    }
    return { w: baseW * ps, h: baseH * ps }
  })()
  const applySelection = useCallback(
    (partial: Partial<EditorState>) => {
      if (Object.keys(partial).length === 0) return
      history.set({ ...state, ...partial })
    },
    [history, state],
  )
  const handleSelectAll = useCallback(
    () => image && applySelection(selectAll(state, previewDims)),
    [image, state, previewDims, applySelection],
  )
  const handleDeselect = useCallback(
    () => applySelection(deselect(state)),
    [state, applySelection],
  )
  const handleReselect = useCallback(
    () => applySelection(reselect(state)),
    [state, applySelection],
  )
  const handleInverse = useCallback(
    () => image && applySelection(inverseSelection(state, previewDims)),
    [image, state, previewDims, applySelection],
  )

  // Select > Modify dialog state. The dialog is shared between Expand /
  // Contract; the kind determines title + onApply branch.
  const [selectModifyOp, setSelectModifyOp] = useState<SelectModifyKind | null>(null)
  const handleSelectModifyApply = useCallback(
    (kind: SelectModifyKind, px: number) => {
      if (kind === 'expand') {
        applySelection(expandSelection(state, px, previewDims))
      } else if (kind === 'contract') {
        applySelection(contractSelection(state, px))
      } else if (kind === 'feather') {
        // Feather is a selection property, not a geometry change — just store
        // the radius; consume sites (Fill / Adjustment / Quick Mask) blur the
        // mask. 0 clears it.
        applySelection({ selectionFeather: px > 0 ? px : undefined })
      } else if (kind === 'smooth' && image) {
        // smoothSelection works on a polygon; materialize one from a rect-only
        // (marquee / wand) selection first. Rasterize at full pre-crop preview
        // dims so the selection-space coords fit the buffer.
        const path =
          state.selectionPath && state.selectionPath.length >= 3
            ? state.selectionPath
            : rectToPath(state.selection)
        if (path) {
          const { baseW, baseH } = dimsAfterRotation(image, state)
          const ps = Math.min(1, PREVIEW_MAX / Math.max(baseW, baseH, 1))
          const w = Math.max(1, Math.round(baseW * ps))
          const h = Math.max(1, Math.round(baseH * ps))
          const smoothed = smoothSelection(path, px, w, h)
          if (smoothed) {
            applySelection({ selection: bboxOfPath(smoothed), selectionPath: smoothed })
          } else {
            toast.message(t('pages.imageEditor.selectMenu.growEmpty'))
          }
        }
      }
      setSelectModifyOp(null)
    },
    [state, previewDims, applySelection, image, t],
  )

  const hasSelection = !!state.selection || (state.selectionPath?.length ?? 0) >= 3
  const canReselect =
    !hasSelection && (!!state.lastSelection || (state.lastSelectionPath?.length ?? 0) >= 3)

  // ── Edit menu: clipboard + Cut/Copy/Paste + Fill/Stroke ─────────────────
  //
  // Clipboard is in-memory, not part of EditorState — Cut/Copy don't push to
  // history (matches PS — pasting is what creates a history entry). Each
  // entry carries the original preview-pixel bbox so Paste-in-Place can
  // land the layer where it came from.
  const [clipboard, setClipboard] = useState<{ dataUrl: string; bbox: { x: number; y: number; w: number; h: number } } | null>(null)
  const [fillOpen, setFillOpen] = useState(false)
  const [strokeOpen, setStrokeOpen] = useState(false)

  /**
   * Copy a region from the editor onto the in-memory clipboard. When a layer
   * is selected (other than 'image'), the region is extracted from just that
   * layer; otherwise the entire composite is sampled. With no selection, the
   * region defaults to the whole canvas — matching PS.
   */
  const copyRegion = useCallback(
    (mode: 'layer' | 'merged'): { dataUrl: string; bbox: { x: number; y: number; w: number; h: number } } | null => {
      if (!image) return null
      const { previewScale, w, h } = previewDimsOf(image, state)
      const region =
        regionFromSelection(state) ?? { kind: 'full', dims: { w, h } } as const
      const canvas =
        mode === 'merged' || selectedLayerId === 'image'
          ? renderEditorToCanvas(image, state, imageCache)
          : renderEditorToCanvas(image, state, imageCache, {
              layerFilter: (l) => l.id === selectedLayerId,
              includeImageBackground: false,
            })
      return extractRegion(canvas, region, previewScale)
    },
    [image, state, selectedLayerId, imageCache],
  )

  const handleCopy = useCallback(() => {
    const r = copyRegion('layer')
    if (!r) {
      toast.message(t('pages.imageEditor.editMenu.copyEmpty'))
      return
    }
    setClipboard(r)
    toast.success(t('pages.imageEditor.editMenu.copied'))
  }, [copyRegion, t])

  const handleCopyMerged = useCallback(() => {
    const r = copyRegion('merged')
    if (!r) {
      toast.message(t('pages.imageEditor.editMenu.copyEmpty'))
      return
    }
    setClipboard(r)
    toast.success(t('pages.imageEditor.editMenu.copied'))
  }, [copyRegion, t])

  /**
   * Cut — Copy, then erase the selection region from the active layer. The
   * active layer is rasterized first (a brush-shape becomes an image-shape
   * carrying the pre-erase bitmap), so Cut works uniformly across vector
   * and pixel layers. Skips the image background (PS treats it as locked).
   */
  const handleCut = useCallback(() => {
    if (!image) return
    if (!hasSelection) {
      toast.message(t('pages.imageEditor.editMenu.cutNeedsSelection'))
      return
    }
    if (selectedLayerId === 'image' || !selectedLayerId) {
      toast.message(t('pages.imageEditor.editMenu.cutNoBackground'))
      return
    }
    const layer = findLayerById(state.layers, selectedLayerId)
    if (!layer || layer.kind === 'group' || layer.kind === 'mask' || layer.kind === 'adjustment' || layer.kind === 'filter') {
      toast.message(t('pages.imageEditor.editMenu.cutNotSupported'))
      return
    }
    const r = copyRegion('layer')
    if (!r) {
      toast.message(t('pages.imageEditor.editMenu.copyEmpty'))
      return
    }
    setClipboard(r)
    // Rasterize current layer and erase the selection region from it.
    const { previewScale, w, h } = previewDimsOf(image, state)
    const layerCanvas = renderEditorToCanvas(image, state, imageCache, {
      layerFilter: (l) => l.id === selectedLayerId,
      includeImageBackground: false,
    })
    const eraseCtx = layerCanvas.getContext('2d')
    if (!eraseCtx) return
    eraseCtx.globalCompositeOperation = 'destination-out'
    eraseCtx.fillStyle = '#000'
    const region = regionFromSelection(state)
    eraseCtx.beginPath()
    if (!region) {
      eraseCtx.rect(0, 0, layerCanvas.width, layerCanvas.height)
    } else if (region.kind === 'rect') {
      const rc = region.rect
      eraseCtx.rect(
        rc.x / previewScale,
        rc.y / previewScale,
        rc.w / previewScale,
        rc.h / previewScale,
      )
    } else {
      for (let i = 0; i < region.path.length; i++) {
        const p = region.path[i]
        const x = p.x / previewScale
        const y = p.y / previewScale
        if (i === 0) eraseCtx.moveTo(x, y)
        else eraseCtx.lineTo(x, y)
      }
      eraseCtx.closePath()
    }
    eraseCtx.fill()
    eraseCtx.globalCompositeOperation = 'source-over'
    let dataUrl: string
    try {
      dataUrl = layerCanvas.toDataURL('image/png')
    } catch {
      return
    }
    const replacement = buildImageShapeLayer({
      dataUrl,
      bbox: { x: 0, y: 0, w, h },
      name: layer.name,
    })
    // Carry over visibility / opacity / blend / fx / clip from the orig.
    const merged: Layer = {
      ...replacement,
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      blend: layer.blend,
      shadow: layer.shadow,
      effects: layer.effects,
      clipRect: layer.clipRect,
      clipPath: layer.clipPath,
      clipInverse: layer.clipInverse,
    }
    history.set({ ...state, layers: mapLayerById(state.layers, layer.id, () => merged) })
    toast.success(t('pages.imageEditor.editMenu.cut'))
  }, [image, hasSelection, selectedLayerId, state, copyRegion, imageCache, history, t])

  const handlePaste = useCallback(() => {
    if (!image || !clipboard) {
      toast.message(t('pages.imageEditor.editMenu.pasteEmpty'))
      return
    }
    const { w: previewW, h: previewH } = previewDimsOf(image, state)
    // Center the pasted region on the preview canvas. Sizes are in preview
    // pixels (the same space shape coords live in).
    const bbox = {
      x: (previewW - clipboard.bbox.w) / 2,
      y: (previewH - clipboard.bbox.h) / 2,
      w: clipboard.bbox.w,
      h: clipboard.bbox.h,
    }
    const layer = buildImageShapeLayer({
      dataUrl: clipboard.dataUrl,
      bbox,
      name: t('pages.imageEditor.annoLabel.paste'),
    })
    commitLayer(layer)
    toast.success(t('pages.imageEditor.editMenu.pasted'))
  }, [image, clipboard, state, commitLayer, t])

  const handlePasteInPlace = useCallback(() => {
    if (!image || !clipboard) {
      toast.message(t('pages.imageEditor.editMenu.pasteEmpty'))
      return
    }
    const layer = buildImageShapeLayer({
      dataUrl: clipboard.dataUrl,
      bbox: clipboard.bbox,
      name: t('pages.imageEditor.annoLabel.paste'),
    })
    commitLayer(layer)
    toast.success(t('pages.imageEditor.editMenu.pasted'))
  }, [image, clipboard, commitLayer, t])

  const handleFillApply = useCallback(
    (args: { color: string; opacity: number; blend: import('@/lib/image-editor/types').BlendMode }) => {
      if (!image) return
      const layer = fillSelection({
        image,
        state,
        color: args.color,
        opacity: args.opacity,
        blend: args.blend,
        name: t('pages.imageEditor.annoLabel.fill'),
      })
      if (!layer) return
      commitLayer(layer)
      setFillOpen(false)
    },
    [image, state, commitLayer, t],
  )

  const handleStrokeApply = useCallback(
    (args: { color: string; width: number; position: StrokePosition }) => {
      if (!image) return
      const layer = strokeSelection({
        image,
        state,
        color: args.color,
        width: args.width,
        position: args.position,
        name: t('pages.imageEditor.annoLabel.stroke'),
      })
      if (!layer) return
      commitLayer(layer)
      setStrokeOpen(false)
    },
    [image, state, commitLayer, t],
  )

  // ── Layer menu: Merge Down / Merge Visible / Flatten Image ──────────────
  //
  // All three reduce to "composite some subset of layers into one image-
  // shape annotation and remove the originals". Flatten goes further by
  // re-binding the underlying image to the result, clearing transforms /
  // adjust / crop / layers — effectively re-baselining the project.
  const handleMergeDown = useCallback(() => {
    if (!image) return
    if (!selectedLayerId || selectedLayerId === 'image') return
    const path = findLayerPath(state.layers, selectedLayerId)
    if (!path) return
    const parentPath = path.slice(0, -1)
    const idx = path[path.length - 1]
    if (idx === 0) {
      toast.message(t('pages.imageEditor.layerMenu.mergeDownNoBelow'))
      return
    }
    // Sibling at idx-1 inside the selected layer's actual parent — must use
    // getLayerAtPath(parentPath) for nested groups (state.layers[parentPath[0]]
    // would skip down only one level and return the grandparent for paths
    // 3+ deep).
    const siblings: Layer[] =
      parentPath.length === 0
        ? state.layers
        : (() => {
            const parent = getLayerAtPath(state.layers, parentPath)
            return parent && isGroup(parent) ? parent.children : []
          })()
    const belowId = siblings[idx - 1]?.id
    if (!belowId) return
    const ids = new Set<string>([selectedLayerId, belowId])
    const merged = mergeLayersToImageLayer({
      image,
      state,
      imageCache,
      pred: (l) => ids.has(l.id),
      name: t('pages.imageEditor.annoLabel.merged'),
    })
    if (!merged) return
    // Remove both originals, insert merged at the lower position.
    let layers = removeLayerById(state.layers, selectedLayerId)
    layers = removeLayerById(layers, belowId)
    const newPath = [...parentPath, idx - 1]
    layers = insertAtPath(layers, newPath, merged)
    history.set({ ...state, layers })
    setSelectedLayerId(merged.id)
    toast.success(t('pages.imageEditor.layerMenu.mergedDown'))
  }, [image, selectedLayerId, state, imageCache, history, t])

  const handleMergeVisible = useCallback(() => {
    if (!image) return
    const visibleIds = new Set<string>()
    const collectVisible = (layers: Layer[]) => {
      for (const l of layers) {
        if (!l.visible) continue
        if (l.kind === 'group') {
          collectVisible(l.children)
        }
        visibleIds.add(l.id)
      }
    }
    collectVisible(state.layers)
    if (visibleIds.size === 0) {
      toast.message(t('pages.imageEditor.layerMenu.mergeVisibleNone'))
      return
    }
    const merged = mergeLayersToImageLayer({
      image,
      state,
      imageCache,
      pred: (l) => visibleIds.has(l.id),
      name: t('pages.imageEditor.annoLabel.merged'),
    })
    if (!merged) return
    // Remove all visible layers, append merged at the top of the top-level
    // stack. Hidden layers are preserved in place.
    let layers = state.layers
    for (const id of visibleIds) {
      layers = removeLayerById(layers, id)
    }
    layers = [...layers, merged]
    history.set({ ...state, layers })
    setSelectedLayerId(merged.id)
    toast.success(t('pages.imageEditor.layerMenu.mergedVisible'))
  }, [image, state, imageCache, history, t])

  /**
   * Stamp Visible (PS: Cmd+Shift+Alt+E). Like Merge Visible, but the source
   * layers are PRESERVED — the merged composite is appended as a new layer
   * on top of the stack. PS also bakes in the image background here (since
   * the snapshot represents "everything you currently see"), so we pass
   * includeImageBackground = true.
   */
  const handleStampVisible = useCallback(() => {
    if (!image) return
    const visibleIds = new Set<string>()
    const collectVisible = (layers: Layer[]) => {
      for (const l of layers) {
        if (!l.visible) continue
        if (l.kind === 'group') collectVisible(l.children)
        visibleIds.add(l.id)
      }
    }
    collectVisible(state.layers)
    const stamped = mergeLayersToImageLayer({
      image,
      state,
      imageCache,
      pred: (l) => visibleIds.has(l.id),
      name: t('pages.imageEditor.annoLabel.stamped'),
      includeImageBackground: state.imageLayer.visible,
    })
    if (!stamped) return
    history.set({ ...state, layers: [...state.layers, stamped] })
    setSelectedLayerId(stamped.id)
    toast.success(t('pages.imageEditor.layerMenu.stamped'))
  }, [image, state, imageCache, history, t])

  /**
   * Convert selected layer to a Smart Object. Pipeline:
   *   1. Rasterize the current layer (post effects / clip / opacity / blend)
   *      cropped to its bbox via composite-ops.rasterizeLayer.
   *   2. Register a new SmartSource pointing at that dataUrl.
   *   3. Replace the original layer in-place with a SmartObjectLayer at its
   *      original bbox; the SO inherits visibility / opacity / blend so the
   *      visual result is unchanged at identity transform.
   * The user can then non-destructively scale / rotate via Free Transform.
   * Image background, mask, adjustment, and filter layers are not convertible
   * (no pixel silhouette to embed).
   */
  const handleConvertToSmartObject = useCallback(() => {
    if (!image || !selectedLayerId || selectedLayerId === 'image') return
    const layer = findLayerById(state.layers, selectedLayerId)
    if (!layer) return
    if (layer.kind === 'mask' || layer.kind === 'adjustment' || layer.kind === 'filter') {
      toast.message(t('pages.imageEditor.smartObject.unsupportedKind'))
      return
    }
    if (layer.kind === 'smartObject') {
      toast.message(t('pages.imageEditor.smartObject.alreadySO'))
      return
    }
    const bbox = getLayerBBox(layer)
    if (!bbox || bbox.w <= 0 || bbox.h <= 0) {
      toast.message(t('pages.imageEditor.smartObject.noBbox'))
      return
    }
    const rast = rasterizeLayer({
      image,
      state,
      imageCache,
      layerId: layer.id,
      crop: bbox,
    })
    if (!rast) {
      toast.error(t('pages.imageEditor.smartObject.rasterFailed'))
      return
    }
    const { layer: soLayer, sourceId, source } = buildSmartObject({
      source: {
        dataUrl: rast.dataUrl,
        w: rast.sourcePixelW,
        h: rast.sourcePixelH,
        name: layer.name,
      },
      name: layer.name,
      place: { kind: 'sourceBbox', bbox: rast.bbox },
    })
    // Preserve original layer's display fields (visibility / opacity / blend /
    // clip / effects) so the visual stays identical at conversion time.
    const merged: Layer = {
      ...soLayer,
      visible: layer.visible,
      opacity: layer.opacity,
      blend: layer.blend,
      effects: layer.effects,
      shadow: layer.shadow,
      clipRect: layer.clipRect,
      clipPath: layer.clipPath,
      clipInverse: layer.clipInverse,
    }
    // Preload the dataUrl into imageCache so the first render after commit
    // can resolve src immediately (otherwise SO renders nothing for a tick).
    ensureImage(rast.dataUrl).catch(() => {})
    history.set({
      ...state,
      layers: mapLayerById(state.layers, layer.id, () => merged),
      smartSources: { ...(state.smartSources ?? {}), [sourceId]: source },
    })
    setSelectedLayerId(merged.id)
    toast.success(t('pages.imageEditor.smartObject.converted'))
  }, [image, selectedLayerId, state, imageCache, ensureImage, history, t])

  /**
   * Replace Contents — pick a new image file, update the SO's source dataUrl
   * (and dims). All other SO layers referencing the same sourceRef update
   * simultaneously (PS linked-instance semantics).
   */
  // ── Layer Comps (panel) ────────────────────────────────────────────────
  const handleSaveLayerComp = useCallback(
    (name: string) => {
      const comp = {
        id: crypto.randomUUID(),
        name,
        createdAt: new Date().toISOString(),
        // Deep-clone via JSON round-trip so the comp isn't aliased to the
        // live state (which would mutate through history).
        layers: JSON.parse(JSON.stringify(state.layers)) as Layer[],
        imageLayer: { ...state.imageLayer },
      }
      history.set({
        ...state,
        layerComps: [...(state.layerComps ?? []), comp],
      })
      toast.success(t('pages.imageEditor.layerComps.saved'))
    },
    [state, history, t],
  )
  const handleApplyLayerComp = useCallback(
    (comp: { id: string; name: string; layers: Layer[]; imageLayer: EditorState['imageLayer'] }) => {
      history.set({
        ...state,
        // Deep-clone so subsequent edits don't mutate the saved comp.
        layers: JSON.parse(JSON.stringify(comp.layers)) as Layer[],
        imageLayer: { ...comp.imageLayer },
      })
      toast.success(t('pages.imageEditor.layerComps.applied', { name: comp.name }))
    },
    [state, history, t],
  )
  const handleDeleteLayerComp = useCallback(
    (id: string) => {
      history.set({
        ...state,
        layerComps: (state.layerComps ?? []).filter((c) => c.id !== id),
      })
    },
    [state, history],
  )

  // ── Raster Layer Mask ───────────────────────────────────────────────
  /**
   * Create a new raster Layer Mask sized to the current preview canvas,
   * fully white (everything below visible). The user can then paint into
   * it with the brush tool (black hides, white reveals).
   */
  const handleNewRasterMask = useCallback(async () => {
    if (!image) return
    const { w, h } = previewDimsOf(image, state)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    const dataUrl = c.toDataURL('image/png')
    // Await so the brush-paint mousedown intercept can synchronously
    // pull the cached image — without this, first paint silently falls
    // through to creating a BrushShape layer over the canvas.
    try {
      await ensureImage(dataUrl)
    } catch {
      /* mask still usable for non-paint rendering */
    }
    const layer: Layer = {
      id: crypto.randomUUID(),
      name: t('pages.imageEditor.maskRaster.defaultName'),
      visible: true,
      opacity: 100,
      blend: 'normal',
      kind: 'mask',
      rects: [],
      dataUrl,
      w,
      h,
    }
    history.set({ ...state, layers: [...state.layers, layer] })
    setSelectedLayerId(layer.id)
    toast.success(t('pages.imageEditor.maskRaster.created'))
  }, [image, state, ensureImage, history, t])

  /**
   * Add a per-adjustment / per-filter raster mask to the currently
   * selected adjustment / filter layer. Initializes the mask to fully
   * white (entire adjustment passes through). User then paints with the
   * brush to gate where the adjustment applies.
   */
  const handleAddAdjustmentMask = useCallback(async () => {
    if (!image || !selectedLayerId || selectedLayerId === 'image') return
    const target = findLayerById(state.layers, selectedLayerId)
    if (!target || (target.kind !== 'adjustment' && target.kind !== 'filter')) {
      toast.message(t('pages.imageEditor.adjMask.unsupportedKind'))
      return
    }
    if (target.maskDataUrl) {
      toast.message(t('pages.imageEditor.adjMask.alreadyHas'))
      return
    }
    const { w, h } = previewDimsOf(image, state)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    const dataUrl = c.toDataURL('image/png')
    try {
      await ensureImage(dataUrl)
    } catch {
      /* still usable */
    }
    patchLayer(target.id, { maskDataUrl: dataUrl, maskW: w, maskH: h })
    toast.success(t('pages.imageEditor.adjMask.added'))
  }, [image, selectedLayerId, state, ensureImage, patchLayer, t])

  /**
   * Remove Mask — clears the mask on the selected layer.
   *   - MaskLayer: deletes the layer entirely (it IS the mask).
   *   - Adjustment / Filter with maskDataUrl: clears the mask fields,
   *     leaving the adjustment to apply everywhere again.
   */
  const handleRemoveMask = useCallback(() => {
    if (!selectedLayerId || selectedLayerId === 'image') return
    const target = findLayerById(state.layers, selectedLayerId)
    if (!target) return
    if (target.kind === 'mask') {
      deleteLayer(target.id)
      toast.success(t('pages.imageEditor.maskActions.removedMaskLayer'))
      return
    }
    if (target.kind === 'adjustment' || target.kind === 'filter') {
      if (!target.maskDataUrl) {
        toast.message(t('pages.imageEditor.maskActions.noMaskToRemove'))
        return
      }
      patchLayer(target.id, {
        maskDataUrl: undefined,
        maskW: undefined,
        maskH: undefined,
      })
      toast.success(t('pages.imageEditor.maskActions.removedAdjMask'))
      return
    }
    toast.message(t('pages.imageEditor.maskActions.noMaskToRemove'))
  }, [selectedLayerId, state.layers, patchLayer, deleteLayer, t])

  /**
   * Apply Mask — bake the selected MaskLayer's effect into the layer
   * immediately below it (in the same parent), then remove the mask. The
   * baked layer becomes a single image annotation with the masked pixels
   * permanent — equivalent to PS "Layer > Layer Mask > Apply".
   *
   * Implementation: rasterize { mask, layerBelow } together via the existing
   * mergeLayersToImageLayer pipeline (which honours the mask's destination-in
   * pass), then replace both with the merged image layer.
   */
  const handleApplyMask = useCallback(() => {
    if (!image) return
    if (!selectedLayerId || selectedLayerId === 'image') return
    const target = findLayerById(state.layers, selectedLayerId)
    if (!target) return
    if (target.kind !== 'mask') {
      toast.message(t('pages.imageEditor.maskActions.applyOnlyMask'))
      return
    }
    if (!target.dataUrl && target.rects.length === 0) {
      toast.message(t('pages.imageEditor.maskActions.applyEmptyMask'))
      return
    }
    const path = findLayerPath(state.layers, selectedLayerId)
    if (!path) return
    const parentPath = path.slice(0, -1)
    const idx = path[path.length - 1]
    if (idx === 0) {
      toast.message(t('pages.imageEditor.maskActions.applyNoTarget'))
      return
    }
    const siblings: Layer[] =
      parentPath.length === 0
        ? state.layers
        : (() => {
            const parent = getLayerAtPath(state.layers, parentPath)
            return parent && isGroup(parent) ? parent.children : []
          })()
    const targetBelow = siblings[idx - 1]
    if (!targetBelow) return
    // Only pixel-emitting layer kinds make sense as bake targets. Adjustment
    // / filter / nested-mask layers have no source pixels to mask into; the
    // rasterizer would produce an empty image and silently destroy the
    // sibling. Bail with a toast instead.
    if (
      targetBelow.kind === 'mask' ||
      targetBelow.kind === 'adjustment' ||
      targetBelow.kind === 'filter'
    ) {
      toast.message(t('pages.imageEditor.maskActions.applyTargetUnsupported'))
      return
    }
    const ids = new Set<string>([target.id, targetBelow.id])
    const merged = mergeLayersToImageLayer({
      image,
      state,
      imageCache,
      pred: (l) => ids.has(l.id),
      name: targetBelow.name,
    })
    if (!merged) return
    let layers = removeLayerById(state.layers, target.id)
    layers = removeLayerById(layers, targetBelow.id)
    const newPath = [...parentPath, idx - 1]
    layers = insertAtPath(layers, newPath, merged)
    history.set({ ...state, layers })
    setSelectedLayerId(merged.id)
    toast.success(t('pages.imageEditor.maskActions.applied'))
  }, [image, selectedLayerId, state, imageCache, history, t])

  /**
   * Convert a rect-based MaskLayer into a raster mask. Rasterizes the
   * existing rects (white inside, black outside) onto a fresh canvas at
   * preview-pixel resolution and replaces `rects` with `dataUrl`.
   */
  const handleConvertMaskToRaster = useCallback(async () => {
    if (!image || !selectedLayerId || selectedLayerId === 'image') return
    const target = findLayerById(state.layers, selectedLayerId)
    if (!target || target.kind !== 'mask') {
      toast.message(t('pages.imageEditor.maskRaster.notAMask'))
      return
    }
    if (target.dataUrl) {
      toast.message(t('pages.imageEditor.maskRaster.alreadyRaster'))
      return
    }
    const { w, h } = previewDimsOf(image, state)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#ffffff'
    for (const r of target.rects) {
      const nx = r.w >= 0 ? r.x : r.x + r.w
      const ny = r.h >= 0 ? r.y : r.y + r.h
      ctx.fillRect(nx, ny, Math.abs(r.w), Math.abs(r.h))
    }
    const dataUrl = c.toDataURL('image/png')
    // Await so first brush stroke after convert finds the dataUrl in cache.
    try {
      await ensureImage(dataUrl)
    } catch {
      /* still usable for rendering */
    }
    patchLayer(target.id, { dataUrl, w, h, rects: [] })
    toast.success(t('pages.imageEditor.maskRaster.converted'))
  }, [image, selectedLayerId, state, ensureImage, patchLayer, t])

  // Brush tip import — extracted to a hook so the file-picker plumbing,
  // alpha-vs-luminance discrimination, and preset persistence don't bloat
  // this component. See useBrushTipImport for the heuristic.
  const handleImportBrushTip = useBrushTipImport({
    customBrushPresets,
    setCustomBrushPresets,
    setStrokeWidth,
    setBrushOptions,
    ensureImage,
    t,
  })

  // ── Quick Mask (Q) ─────────────────────────────────────────────────────
  const handleToggleQuickMask = useCallback(async () => {
    if (!image) return
    if (state.quickMask) {
      // Exit Quick Mask: threshold the mask back to a bbox selection.
      // Pixel-perfect roundtrip via marching-squares is v2; for v1 we
      // extract the bbox of all "selected" (white) pixels.
      const cached = imageCache.get(state.quickMask.dataUrl)
      if (!cached) {
        history.set({ ...state, quickMask: undefined })
        toast.message(t('pages.imageEditor.quickMask.exitedNoSel'))
        return
      }
      const c = document.createElement('canvas')
      c.width = state.quickMask.w
      c.height = state.quickMask.h
      const ctx = c.getContext('2d')
      if (!ctx) return
      ctx.drawImage(cached, 0, 0)
      let data: ImageData
      try {
        data = ctx.getImageData(0, 0, c.width, c.height)
      } catch {
        history.set({ ...state, quickMask: undefined })
        return
      }
      // Marching-squares (Moore boundary) contour: walks the perimeter of
      // the largest connected selected region. Concave shapes follow their
      // true silhouette instead of degrading to a left/right envelope.
      const path = extractMaskContour(data.data, c.width, c.height, {
        threshold: 127,
        maxPoints: 400,
      })
      if (path.length === 0) {
        history.set({
          ...state,
          quickMask: undefined,
          selection: undefined,
          selectionPath: undefined,
        })
        toast.message(t('pages.imageEditor.quickMask.exitedEmpty'))
        return
      }
      let minX = c.width, minY = c.height, maxX = 0, maxY = 0
      for (const p of path) {
        if (p.x < minX) minX = p.x
        if (p.x > maxX) maxX = p.x
        if (p.y < minY) minY = p.y
        if (p.y > maxY) maxY = p.y
      }
      history.set({
        ...state,
        quickMask: undefined,
        selection: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
        selectionPath: path.length >= 3 ? path : undefined,
        selectionInverse: false,
      })
      toast.success(t('pages.imageEditor.quickMask.exited'))
    } else {
      // Enter Quick Mask: rasterize the current selection (rect / path)
      // into a fresh dataUrl. No selection → fully unselected mask
      // (all black) — user paints selection in.
      const { w, h } = previewDimsOf(image, state)
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, w, h)
      // White = selected. Route through the shared mask builder so a feathered
      // selection carries its soft edge (and inversion) into Quick Mask.
      const mask = buildSelectionMaskCanvas({
        w,
        h,
        path: state.selectionPath,
        rect: state.selection,
        feather: state.selectionFeather ?? 0,
        inverse: state.selectionInverse,
      })
      if (mask) ctx.drawImage(mask, 0, 0)
      const dataUrl = c.toDataURL('image/png')
      try {
        await ensureImage(dataUrl)
      } catch {
        /* fallthrough — paint won't preview but mode is still entered */
      }
      history.set({ ...state, quickMask: { dataUrl, w, h } })
      toast.success(t('pages.imageEditor.quickMask.entered'))
    }
  }, [image, state, imageCache, ensureImage, history, t])

  /** Toggle PS clipping mask on the selected layer. */
  const handleToggleClippingMask = useCallback(() => {
    if (!selectedLayerId || selectedLayerId === 'image') return
    const target = findLayerById(state.layers, selectedLayerId)
    if (!target) return
    // v1: clipping is meaningful only for pixel-emitting layers (annotation /
    // smartObject / group). Adjustment / filter / mask layers consume the
    // canvas below them; supporting them as clippers correctly requires
    // computing the base alpha as a clip mask applied during their own
    // pixel-transform pass, which the v1 render pipeline doesn't do.
    // Without this guard, a user marking an adjustment as clipping would
    // see it silently vanish.
    if (
      target.kind === 'adjustment' ||
      target.kind === 'filter' ||
      target.kind === 'mask'
    ) {
      toast.message(t('pages.imageEditor.clippingMask.unsupportedKind'))
      return
    }
    patchLayer(selectedLayerId, { clipping: !target.clipping })
    toast.success(
      t(
        target.clipping
          ? 'pages.imageEditor.clippingMask.released'
          : 'pages.imageEditor.clippingMask.created',
      ),
    )
  }, [selectedLayerId, state.layers, patchLayer, t])

  const handleReplaceContents = useCallback(async () => {
    if (!image || !selectedLayerId) return
    const layer = findLayerById(state.layers, selectedLayerId)
    if (!layer || layer.kind !== 'smartObject') return
    const file = await pickFile('image/*')
    if (!file) return
    try {
      const dataUrl = await fileToDataUrl(file)
      const img = await ensureImage(dataUrl)
      const sources = state.smartSources ?? {}
      const updated: SmartSource = {
        dataUrl,
        w: img.naturalWidth,
        h: img.naturalHeight,
        name: file.name || sources[layer.sourceRef]?.name || 'Source',
      }
      history.set({
        ...state,
        smartSources: { ...sources, [layer.sourceRef]: updated },
      })
      toast.success(t('pages.imageEditor.smartObject.replaced'))
    } catch {
      toast.error(t('pages.imageEditor.errLoadFailed'))
    }
  }, [image, selectedLayerId, state, ensureImage, history, t])

  const handleFlatten = useCallback(async () => {
    if (!image) return
    const dataUrl = flattenToDataUrl(image, state, imageCache)
    if (!dataUrl) return
    try {
      const img = await loadImageFromUrl(dataUrl)
      setImage(img)
      // Reset everything that no longer makes sense after a flatten — layers
      // are baked in, transforms / adjust are zeroed, crop / selection
      // cleared. History is wiped via `reset` so undo can't accidentally
      // resurrect the pre-flatten layers with the new bitmap baseline.
      history.reset(initialState())
      setSelectedLayerId('image')
      toast.success(t('pages.imageEditor.layerMenu.flattened'))
    } catch {
      toast.error(t('pages.imageEditor.errLoadFailed'))
    }
  }, [image, state, imageCache, history, t])

  // ── Image > Image Size ────────────────────────────────────────────────
  const [imageSizeOpen, setImageSizeOpen] = useState(false)
  const handleImageSizeApply = useCallback(
    async (next: { w: number; h: number }) => {
      if (!image) return
      setImageSizeOpen(false)
      const oldW = image.naturalWidth
      const oldH = image.naturalHeight
      // Compute preview-pixel scale ratio. Layer coords live in preview
      // space — and previewScale ITSELF changes when the image's
      // larger-dimension crosses PREVIEW_MAX, so naively using
      // (newW / oldW) under-/over-shoots when the threshold is crossed.
      const oldPreviewScale = Math.min(1, PREVIEW_MAX / Math.max(oldW, oldH, 1))
      const newPreviewScale = Math.min(1, PREVIEW_MAX / Math.max(next.w, next.h, 1))
      const previewSx = (next.w * newPreviewScale) / (oldW * oldPreviewScale)
      const previewSy = (next.h * newPreviewScale) / (oldH * oldPreviewScale)
      // Resample the underlying image at the new resolution. We render via a
      // plain canvas (not flattenToDataUrl) because we want only the image
      // pixels, not the baked layers — layers stay non-destructive.
      const tmp = document.createElement('canvas')
      tmp.width = next.w
      tmp.height = next.h
      const tctx = tmp.getContext('2d')
      if (!tctx) return
      tctx.imageSmoothingEnabled = true
      tctx.imageSmoothingQuality = 'high'
      tctx.drawImage(image, 0, 0, next.w, next.h)
      try {
        const img = await loadImageFromUrl(tmp.toDataURL('image/png'))
        setImage(img)
        history.set({
          ...state,
          layers: state.layers.map((l) => scaleLayer(l, previewSx, previewSy)),
          selection: state.selection
            ? {
                x: state.selection.x * previewSx,
                y: state.selection.y * previewSy,
                w: state.selection.w * previewSx,
                h: state.selection.h * previewSy,
              }
            : undefined,
          selectionPath: state.selectionPath?.map((p) => ({
            x: p.x * previewSx,
            y: p.y * previewSy,
          })),
          cropRect: state.cropRect
            ? {
                x: state.cropRect.x * previewSx,
                y: state.cropRect.y * previewSy,
                w: state.cropRect.w * previewSx,
                h: state.cropRect.h * previewSy,
              }
            : undefined,
        })
        toast.success(t('pages.imageEditor.imageSize.applied'))
      } catch {
        toast.error(t('pages.imageEditor.errLoadFailed'))
      }
    },
    [image, state, history, t],
  )

  // ── Image > Canvas Size ───────────────────────────────────────────────
  const [canvasSizeOpen, setCanvasSizeOpen] = useState(false)
  const handleCanvasSizeApply = useCallback(
    async (args: { w: number; h: number; anchor: Anchor9; bgColor: string }) => {
      if (!image) return
      setCanvasSizeOpen(false)
      const { w: newW, h: newH, anchor, bgColor } = args
      const oldW = image.naturalWidth
      const oldH = image.naturalHeight
      // Anchor → offset where to place the OLD image inside the new canvas
      // (source-pixel delta for the drawImage call).
      const dxSrc = anchorOffset(anchor, 'x') * (newW - oldW)
      const dySrc = anchorOffset(anchor, 'y') * (newH - oldH)
      // translateLayer operates in preview-pixel space — convert.
      const newPreviewScale = Math.min(1, PREVIEW_MAX / Math.max(newW, newH, 1))
      const dxPreview = dxSrc * newPreviewScale
      const dyPreview = dySrc * newPreviewScale
      const tmp = document.createElement('canvas')
      tmp.width = newW
      tmp.height = newH
      const tctx = tmp.getContext('2d')
      if (!tctx) return
      tctx.fillStyle = bgColor
      tctx.fillRect(0, 0, newW, newH)
      tctx.drawImage(image, dxSrc, dySrc)
      try {
        const img = await loadImageFromUrl(tmp.toDataURL('image/png'))
        setImage(img)
        // New preview-pixel canvas dims after resize. Mask raster dataUrls
        // are at the OLD preview dims; re-rasterize each onto a fresh
        // canvas of the new dims with the old content offset by
        // (dxPreview, dyPreview) so they stay aligned with the (also
        // translated) layer geometry.
        const newCanvasPreviewW = newW * newPreviewScale
        const newCanvasPreviewH = newH * newPreviewScale
        const relignedLayers = state.layers
          .map((l) => translateLayer(l, dxPreview, dyPreview))
          .map((l) => realignMaskOnCanvasResize(
            l,
            imageCache,
            newCanvasPreviewW,
            newCanvasPreviewH,
            dxPreview,
            dyPreview,
            ensureImage,
          ))
        history.set({
          ...state,
          layers: relignedLayers,
          // Cleared crop / selection — the canvas resize invalidates them.
          cropRect: undefined,
          selection: undefined,
          selectionPath: undefined,
        })
        toast.success(t('pages.imageEditor.canvasSize.applied'))
      } catch {
        toast.error(t('pages.imageEditor.errLoadFailed'))
      }
    },
    [image, state, imageCache, ensureImage, history, t],
  )

  // ── Image > Trim ───────────────────────────────────────────────────────
  // Detect a transparent / uniform-edge-colour border by scanning all four
  // sides of the rendered composite. Sets `cropRect` to the trimmed region
  // (non-destructive — Reveal All restores).
  const handleTrim = useCallback(() => {
    if (!image) return
    if (state.cropRect) {
      // V1: Trim assumes original-image coords. With an active crop,
      // renderEditorToCanvas returns the cropped frame and the resulting
      // bbox would land in the wrong coord space. Ask the user to clear
      // the crop first via Reveal All.
      toast.message(t('pages.imageEditor.imageMenu.trimNeedsRevealAll'))
      return
    }
    const canvas = renderEditorToCanvas(image, state, imageCache, {
      includeImageBackground: true,
    })
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let data: ImageData
    try {
      data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    } catch {
      toast.error(t('pages.imageEditor.imageMenu.trimFailed'))
      return
    }
    const bbox = findTrimBBox(data)
    if (!bbox) {
      toast.message(t('pages.imageEditor.imageMenu.trimNothing'))
      return
    }
    // Convert source-pixel bbox to preview-pixel cropRect.
    const { previewScale } = previewDimsOf(image, state)
    history.set({
      ...state,
      cropRect: {
        x: bbox.x * previewScale,
        y: bbox.y * previewScale,
        w: bbox.w * previewScale,
        h: bbox.h * previewScale,
      },
    })
    toast.success(t('pages.imageEditor.imageMenu.trimmed'))
  }, [image, state, imageCache, history, t])

  // ── Image > Reveal All ─────────────────────────────────────────────────
  // Clears any active crop, revealing the full image area.
  const handleRevealAll = useCallback(() => {
    if (!state.cropRect) {
      toast.message(t('pages.imageEditor.imageMenu.noCropToReveal'))
      return
    }
    history.set({ ...state, cropRect: undefined })
    toast.success(t('pages.imageEditor.imageMenu.revealed'))
  }, [state, history, t])

  // ── Image > Image Rotation > Arbitrary ────────────────────────────────
  const [rotateOpen, setRotateOpen] = useState(false)
  // Color picker target: 'fg' / 'bg' for FG/BG swatches; null = closed.
  const [colorPicker, setColorPicker] = useState<'fg' | 'bg' | null>(null)
  const handleRotateArbitraryApply = useCallback(
    async (degrees: number) => {
      setRotateOpen(false)
      if (!image || degrees === 0) return
      // Rasterize the whole editor first (so adjust / layers bake in), then
      // rotate. Output canvas is sized to fit the rotated bbox of the
      // existing image dims.
      const r = (degrees * Math.PI) / 180
      const sin = Math.abs(Math.sin(r))
      const cos = Math.abs(Math.cos(r))
      const newW = Math.round(image.naturalWidth * cos + image.naturalHeight * sin)
      const newH = Math.round(image.naturalWidth * sin + image.naturalHeight * cos)
      const dataUrl = flattenToDataUrl(image, state, imageCache)
      if (!dataUrl) return
      try {
        const src = await loadImageFromUrl(dataUrl)
        const tmp = document.createElement('canvas')
        tmp.width = newW
        tmp.height = newH
        const tctx = tmp.getContext('2d')
        if (!tctx) return
        tctx.translate(newW / 2, newH / 2)
        tctx.rotate(r)
        tctx.drawImage(src, -src.naturalWidth / 2, -src.naturalHeight / 2)
        const out = await loadImageFromUrl(tmp.toDataURL('image/png'))
        setImage(out)
        history.reset(initialState())
        setSelectedLayerId('image')
        toast.success(t('pages.imageEditor.rotateArbitrary.applied'))
      } catch {
        toast.error(t('pages.imageEditor.errLoadFailed'))
      }
    },
    [image, state, imageCache, history, t],
  )

  useEffect(() => {
    duplicateRef.current = () => {
      if (!selectedLayerId || selectedLayerId === 'image') return
      const orig = findLayerById(state.layers, selectedLayerId)
      if (!orig) return
      const copy = deepCloneLayerWithNewIds(orig)
      copy.name = `${orig.name} copy`
      // Translate the new layer 10px down/right so users see the duplicate
      // peeking out from under the original.
      const shifted = translateLayer(copy, 10, 10)
      // Insert as a sibling immediately after the original in its parent.
      const path = findLayerPath(state.layers, selectedLayerId)
      if (!path) return
      const insertPath = [...path.slice(0, -1), path[path.length - 1] + 1]
      history.set({ ...state, layers: insertAtPath(state.layers, insertPath, shifted) })
      setSelectedLayerId(shifted.id)
    }
    moveLayerRef.current = (direction) => {
      if (!selectedLayerId || selectedLayerId === 'image') return
      const next = reorderSibling(state.layers, selectedLayerId, direction)
      if (next === state.layers) return
      history.set({ ...state, layers: next })
    }
    deleteLayerRef.current = () => {
      if (!selectedLayerId || selectedLayerId === 'image') return
      history.set({ ...state, layers: removeLayerById(state.layers, selectedLayerId) })
      setSelectedLayerId('image')
    }
    groupRef.current = groupSelected
    ungroupRef.current = ungroupSelected
    selectAllRef.current = handleSelectAll
    deselectRef.current = handleDeselect
    reselectRef.current = handleReselect
    inverseSelectionRef.current = handleInverse
    cutRef.current = handleCut
    copyRef.current = handleCopy
    copyMergedRef.current = handleCopyMerged
    pasteRef.current = handlePaste
    pasteInPlaceRef.current = handlePasteInPlace
    mergeDownRef.current = handleMergeDown
    mergeVisibleRef.current = handleMergeVisible
    stampVisibleRef.current = handleStampVisible
    clippingMaskRef.current = handleToggleClippingMask
    quickMaskToggleRef.current = handleToggleQuickMask
  })

  // ── Crop ─────────────────────────────────────────────────────────────────
  const handleCommitCrop = useCallback(
    (rect: { x: number; y: number; w: number; h: number }) => {
      history.set({ ...state, cropRect: rect })
      setTool('none')
      toast.success(t('pages.imageEditor.cropApplied'))
    },
    [history, state, t],
  )
  /**
   * Commit a marquee selection — `rect` arrives in cropped-canvas
   * preview-pixel space; we shift back by the crop origin to land in
   * original-image preview-pixel space (where shape coords live).
   */
  const handleCommitSelection = useCallback(
    (
      rect: { x: number; y: number; w: number; h: number },
      mod: SelectionModifier,
    ) => {
      const cropOriginX = state.cropRect
        ? Math.min(state.cropRect.x, state.cropRect.x + state.cropRect.w)
        : 0
      const cropOriginY = state.cropRect
        ? Math.min(state.cropRect.y, state.cropRect.y + state.cropRect.h)
        : 0
      const x0 = Math.min(rect.x, rect.x + rect.w) + cropOriginX
      const y0 = Math.min(rect.y, rect.y + rect.h) + cropOriginY
      const w = Math.abs(rect.w)
      const h = Math.abs(rect.h)
      const fresh = { x: x0, y: y0, w, h }
      // Replace mode (default, no modifier) or no existing selection: just
      // overwrite. Modifier flows need a previous selection to combine with.
      if (mod === 'replace' || !state.selection) {
        history.set({
          ...state,
          selection: fresh,
          selectionPath: undefined,
          selectionInverse: false,
          selectionFeather: featherOption || undefined,
        })
        return
      }
      const combined = combineRectSelection(state, fresh, mod, image)
      history.set({ ...state, ...combined, selectionFeather: featherOption || undefined })
    },
    [history, state, image, featherOption],
  )

  /**
   * Commit a polygon selection from Lasso / Polygonal Lasso. Points arrive in
   * cropped-canvas preview-pixel space; we shift each by the crop origin so
   * both `selection` (bbox) and `selectionPath` (outline) live in
   * original-image preview-pixel space — same convention as marquee.
   */
  const handleCommitPolygonSelection = useCallback(
    (points: Point[], mod: SelectionModifier) => {
      if (points.length < 3) return
      const cropOriginX = state.cropRect
        ? Math.min(state.cropRect.x, state.cropRect.x + state.cropRect.w)
        : 0
      const cropOriginY = state.cropRect
        ? Math.min(state.cropRect.y, state.cropRect.y + state.cropRect.h)
        : 0
      const shifted = points.map((p) => ({ x: p.x + cropOriginX, y: p.y + cropOriginY }))
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const p of shifted) {
        if (p.x < minX) minX = p.x
        if (p.y < minY) minY = p.y
        if (p.x > maxX) maxX = p.x
        if (p.y > maxY) maxY = p.y
      }
      const fresh = { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
      if (mod === 'replace' || !state.selection) {
        history.set({
          ...state,
          selection: fresh,
          selectionPath: shifted,
          selectionInverse: false,
          selectionFeather: featherOption || undefined,
        })
        return
      }
      const combined = combinePathSelection(state, shifted, fresh, mod, image)
      history.set({ ...state, ...combined, selectionFeather: featherOption || undefined })
    },
    [history, state, image, featherOption],
  )

  /**
   * Magic Wand click. Renders the canvas at source resolution, runs the same
   * scanline flood fill the Paint Bucket uses, and stores the bbox of the
   * matching region as a rectangular selection (no polygon path — wand
   * regions are already implied by their bbox + contents).
   */
  const handleWandClick = useCallback(
    async (point: Point) => {
      if (!image) return
      const { baseW, baseH } = dimsAfterRotation(image, state)
      const previewScale = Math.min(1, PREVIEW_MAX / Math.max(baseW, baseH, 1))
      const srcCanvas = document.createElement('canvas')
      renderTo(srcCanvas, { image, state, scale: 1, previewScale, imageCache })
      const ctx = srcCanvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return

      const cropOriginX = state.cropRect
        ? Math.min(state.cropRect.x, state.cropRect.x + state.cropRect.w)
        : 0
      const cropOriginY = state.cropRect
        ? Math.min(state.cropRect.y, state.cropRect.y + state.cropRect.h)
        : 0
      const sx = Math.round((point.x + cropOriginX) / previewScale)
      const sy = Math.round((point.y + cropOriginY) / previewScale)

      let imageData: ImageData
      try {
        imageData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height)
      } catch {
        toast.error(t('pages.imageEditor.errBucketRead'))
        return
      }

      const mask = floodFillMask(imageData, sx, sy, wandTolerance)
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      let any = false
      const w = srcCanvas.width
      const h = srcCanvas.height
      for (let y = 0; y < h; y++) {
        const row = y * w
        for (let x = 0; x < w; x++) {
          if (mask[row + x]) {
            any = true
            if (x < minX) minX = x
            if (y < minY) minY = y
            if (x > maxX) maxX = x
            if (y > maxY) maxY = y
          }
        }
      }
      if (!any) {
        toast.message(t('pages.imageEditor.wandEmpty'))
        return
      }
      // bbox is in source-pixel space; convert to original-image preview
      // pixel space (where selection coords live) by multiplying by previewScale.
      history.set({
        ...state,
        selection: {
          x: minX * previewScale,
          y: minY * previewScale,
          w: (maxX - minX + 1) * previewScale,
          h: (maxY - minY + 1) * previewScale,
        },
        selectionPath: undefined,
      })
    },
    [image, state, imageCache, wandTolerance, history, t],
  )

  // ── Color Range / Select Subject / Grow / Remove Background ──────────────
  //
  // These all consume the rendered *composite* at preview resolution (what the
  // user sees) and emit a polygon. Rendering at `scale: previewScale` makes the
  // buffer 1 px == 1 preview px, so a contour point in buffer space maps to
  // selection space by adding the crop origin (preview units) — exactly the
  // convention `handleCommitSelection` uses. w/h are never offset.
  const renderPreviewComposite = useCallback((): {
    data: Uint8ClampedArray
    w: number
    h: number
    cropX: number
    cropY: number
  } | null => {
    if (!image) return null
    const { baseW, baseH } = dimsAfterRotation(image, state)
    const previewScale = Math.min(1, PREVIEW_MAX / Math.max(baseW, baseH, 1))
    const c = document.createElement('canvas')
    renderTo(c, { image, state, scale: previewScale, previewScale, imageCache })
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx || c.width < 1 || c.height < 1) return null
    let data: ImageData
    try {
      data = ctx.getImageData(0, 0, c.width, c.height)
    } catch {
      return null
    }
    const cropX = state.cropRect
      ? Math.min(state.cropRect.x, state.cropRect.x + state.cropRect.w)
      : 0
    const cropY = state.cropRect
      ? Math.min(state.cropRect.y, state.cropRect.y + state.cropRect.h)
      : 0
    return { data: data.data, w: c.width, h: c.height, cropX, cropY }
  }, [image, state, imageCache])

  // Color Range dialog: sampled-color → distance-threshold selection. The
  // dialog owns the eyedropper + live preview; we hand it the composite buffer
  // and translate its result (buffer space) back to selection space on apply.
  const [colorRangeSource, setColorRangeSource] = useState<
    { data: Uint8ClampedArray; w: number; h: number; cropX: number; cropY: number } | null
  >(null)
  const handleOpenColorRange = useCallback(() => {
    const buf = renderPreviewComposite()
    if (!buf) {
      toast.error(t('pages.imageEditor.errBucketRead'))
      return
    }
    setColorRangeSource(buf)
  }, [renderPreviewComposite, t])
  const handleColorRangeApply = useCallback(
    (sel: { path: Point[]; bbox: Rect; regionCount: number }) => {
      const src = colorRangeSource
      setColorRangeSource(null)
      if (!src) return
      const path = sel.path.map((p) => ({ x: p.x + src.cropX, y: p.y + src.cropY }))
      history.set({
        ...state,
        selection: { ...sel.bbox, x: sel.bbox.x + src.cropX, y: sel.bbox.y + src.cropY },
        selectionPath: path.length >= 3 ? path : undefined,
        selectionInverse: false,
      })
      if (sel.regionCount > 1) {
        toast.message(t('pages.imageEditor.selectMenu.multiRegion', { count: sel.regionCount }))
      }
    },
    [colorRangeSource, history, state, t],
  )

  // Replace Color dialog: same eyedropper-on-composite pattern as Color Range.
  // Reuses the renderPreviewComposite helper; commits an adjustment layer with
  // the resulting params (the actual pixel work happens in applyAdjustment).
  const [replaceColorSource, setReplaceColorSource] = useState<
    { data: Uint8ClampedArray; w: number; h: number } | null
  >(null)
  const handleOpenReplaceColor = useCallback(() => {
    const buf = renderPreviewComposite()
    if (!buf) {
      toast.error(t('pages.imageEditor.errBucketRead'))
      return
    }
    setReplaceColorSource({ data: buf.data, w: buf.w, h: buf.h })
  }, [renderPreviewComposite, t])
  const handleReplaceColorApply = useCallback(
    (params: ReplaceColorParams) => {
      setReplaceColorSource(null)
      // Replace Color uses its own eyedropper dialog rather than the generic
      // AdjustmentDialog, so the commit is inlined here (mirrors the
      // handleAdjustmentApply path — just commits an adjustment layer).
      commitLayer({
        id: crypto.randomUUID(),
        name: t('pages.imageEditor.adjustments.replaceColor'),
        visible: true,
        opacity: 100,
        blend: 'normal',
        kind: 'adjustment',
        params,
      })
    },
    [commitLayer, t],
  )

  // Select Subject — saliency heuristic over the composite. Deferred a tick so
  // the "detecting…" toast paints before the synchronous CV work blocks.
  const handleSelectSubject = useCallback(() => {
    const buf = renderPreviewComposite()
    if (!buf) {
      toast.error(t('pages.imageEditor.errBucketRead'))
      return
    }
    const id = toast.loading(t('pages.imageEditor.selectMenu.subjectDetecting'))
    setTimeout(() => {
      const res = selectSubject(buf.data, buf.w, buf.h)
      toast.dismiss(id)
      if (!res) {
        toast.message(t('pages.imageEditor.selectMenu.subjectNotFound'))
        return
      }
      const path = res.path.map((p) => ({ x: p.x + buf.cropX, y: p.y + buf.cropY }))
      history.set({
        ...state,
        selection: { ...res.bbox, x: res.bbox.x + buf.cropX, y: res.bbox.y + buf.cropY },
        selectionPath: path.length >= 3 ? path : undefined,
        selectionInverse: false,
      })
    }, 16)
  }, [renderPreviewComposite, history, state, t])

  // Grow — expand the current selection into contiguous same-ish-color pixels.
  const handleSelectGrow = useCallback(() => {
    if (!state.selection && (state.selectionPath?.length ?? 0) < 3) {
      toast.message(t('pages.imageEditor.selectMenu.noSelection'))
      return
    }
    const buf = renderPreviewComposite()
    if (!buf) return
    // Current selection → buffer space (subtract crop origin), rasterize a mask.
    const path =
      state.selectionPath && state.selectionPath.length >= 3
        ? state.selectionPath.map((p) => ({ x: p.x - buf.cropX, y: p.y - buf.cropY }))
        : undefined
    const rect = state.selection
      ? { ...state.selection, x: state.selection.x - buf.cropX, y: state.selection.y - buf.cropY }
      : undefined
    const mask = rasterizePolygonMask(path, rect, buf.w, buf.h)
    const res = growSelection(buf.data, buf.w, buf.h, mask, wandTolerance)
    if (!res) {
      toast.message(t('pages.imageEditor.selectMenu.growEmpty'))
      return
    }
    const outPath = res.path.map((p) => ({ x: p.x + buf.cropX, y: p.y + buf.cropY }))
    history.set({
      ...state,
      selection: { ...res.bbox, x: res.bbox.x + buf.cropX, y: res.bbox.y + buf.cropY },
      selectionPath: outPath.length >= 3 ? outPath : undefined,
      selectionInverse: false,
    })
  }, [renderPreviewComposite, state, history, wandTolerance, t])

  // Remove Background — Select Subject, then add a raster Layer Mask that
  // reveals only the subject (white) over a black background. Reuses the same
  // mask-layer machinery as handleNewRasterMask; no new masking engine.
  const handleRemoveBackground = useCallback(async () => {
    const buf = renderPreviewComposite()
    if (!buf) {
      toast.error(t('pages.imageEditor.errBucketRead'))
      return
    }
    const id = toast.loading(t('pages.imageEditor.selectMenu.subjectDetecting'))
    const res = selectSubject(buf.data, buf.w, buf.h)
    if (!res) {
      toast.dismiss(id)
      toast.message(t('pages.imageEditor.selectMenu.subjectNotFound'))
      return
    }
    // Build the mask at full pre-crop preview dims so it aligns with the canvas
    // the renderer composites mask layers against.
    const { w, h } = previewDimsOf(image!, state)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) {
      toast.dismiss(id)
      return
    }
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, w, h)
    const shape = buildSelectionMaskCanvas({
      w,
      h,
      path: res.path.map((p) => ({ x: p.x + buf.cropX, y: p.y + buf.cropY })),
      feather: 0,
    })
    if (shape) ctx.drawImage(shape, 0, 0)
    const dataUrl = c.toDataURL('image/png')
    try {
      await ensureImage(dataUrl)
    } catch {
      /* mask still renders for non-paint compositing */
    }
    const layer: Layer = {
      id: crypto.randomUUID(),
      name: t('pages.imageEditor.selectMenu.removeBackground'),
      visible: true,
      opacity: 100,
      blend: 'normal',
      kind: 'mask',
      rects: [],
      dataUrl,
      w,
      h,
    }
    toast.dismiss(id)
    history.set({ ...state, layers: [...state.layers, layer] })
    setSelectedLayerId(layer.id)
    toast.success(t('pages.imageEditor.selectMenu.removeBackground'))
  }, [renderPreviewComposite, image, state, ensureImage, history, t])

  // ── Liquify session ────────────────────────────────────────────────────
  /** Snapshot the composite into a working canvas — that canvas becomes the
   *  warpable surface the Canvas overlays on top of the rendered scene. */
  const handleEnterLiquify = useCallback(() => {
    if (!image) return
    const buf = renderPreviewComposite()
    if (!buf) {
      toast.error(t('pages.imageEditor.errBucketRead'))
      return
    }
    const c = document.createElement('canvas')
    c.width = buf.w
    c.height = buf.h
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    ctx.putImageData(new ImageData(new Uint8ClampedArray(buf.data), buf.w, buf.h), 0, 0)
    setLiquifyCanvas(c)
  }, [image, renderPreviewComposite, t])
  // Bind the entry handler into the ref `trySetTool` reaches; mirrors the
  // forward-ref pattern used by duplicateRef / moveLayerRef / etc. (Same
  // shape as those, but the linter over-fires on this one specifically — the
  // assignment is idiomatic React + identical to the pattern several lines
  // up; disabling locally with a justification.)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    liquifyEnterRef.current = () => handleEnterLiquify()
  }, [handleEnterLiquify])

  const handleCancelLiquify = useCallback(() => {
    setLiquifyCanvas(null)
  }, [])

  /** Apply: commit the warped canvas as a full-canvas image-shape layer.
   *  Layer bbox uses preview-pixel dims so existing transform math applies. */
  const handleApplyLiquify = useCallback(() => {
    if (!liquifyCanvas || !image) return
    let dataUrl: string
    try {
      dataUrl = liquifyCanvas.toDataURL('image/png')
    } catch {
      toast.error(t('pages.imageEditor.errBucketRead'))
      return
    }
    const { w, h } = previewDimsOf(image, state)
    commitLayer({
      id: crypto.randomUUID(),
      name: t('pages.imageEditor.tool.liquify'),
      visible: true,
      opacity: 100,
      blend: 'normal',
      kind: 'annotation',
      shape: { kind: 'image', x: 0, y: 0, w, h, dataUrl },
    })
    setLiquifyCanvas(null)
  }, [liquifyCanvas, image, state, commitLayer, t])

  /** Each pointer-move during a Liquify stroke: snapshot the working canvas,
   *  apply the warp stamp into a fresh buffer, write back. Source/dest are
   *  separate so a single stamp can't feedback on itself mid-evaluation. */
  const handleLiquifyStamp = useCallback(
    (cx: number, cy: number, dx: number, dy: number) => {
      const c = liquifyCanvas
      if (!c) return
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      const src = ctx.getImageData(0, 0, c.width, c.height)
      const dst = new ImageData(new Uint8ClampedArray(src.data), c.width, c.height)
      applyLiquifyBrush({
        src: src.data,
        dst: dst.data,
        w: c.width,
        h: c.height,
        cx,
        cy,
        radius: liquifySize,
        strength: liquifyStrength / 100,
        mode: liquifyMode,
        dx,
        dy,
      })
      ctx.putImageData(dst, 0, 0)
      setLiquifyTick((n) => n + 1)
    },
    [liquifyCanvas, liquifySize, liquifyStrength, liquifyMode],
  )

  const handleClearCrop = useCallback(() => {
    if (!state.cropRect) return
    history.set({ ...state, cropRect: undefined })
    toast.success(t('pages.imageEditor.cropCleared'))
  }, [history, state, t])

  // ── Rulers + Guides ────────────────────────────────────────────────────
  /** Drop a new guide at `pos` (preview px) on the given axis. Deduped so a
   *  user dragging out the same spot twice doesn't pile up identical lines. */
  const handleAddGuide = useCallback(
    (axis: 'h' | 'v', pos: number) => {
      const rounded = Math.round(pos)
      const prev = state.guides ?? { h: [], v: [] }
      const arr = axis === 'h' ? prev.h : prev.v
      if (arr.some((g) => Math.abs(g - rounded) < 1)) return
      const next = {
        h: axis === 'h' ? [...prev.h, rounded] : prev.h,
        v: axis === 'v' ? [...prev.v, rounded] : prev.v,
      }
      history.set({ ...state, guides: next })
    },
    [history, state],
  )
  const handleClearGuides = useCallback(() => {
    if (!state.guides || (state.guides.h.length === 0 && state.guides.v.length === 0)) return
    history.set({ ...state, guides: undefined })
    toast.success(t('pages.imageEditor.view.guidesCleared'))
  }, [history, state, t])

  // ── Adjustments dialog ─────────────────────────────────────────────────
  // `openAdjustment` toggles the modal; `adjustmentDraft` holds the live
  // preview layer that Canvas overlays via its `extraPreviewLayer` prop. On
  // Apply, the draft is committed via the regular commitLayer flow (which
  // also bakes in any active selection clip). On Cancel, the draft is
  // discarded and the canvas snaps back.
  const [openAdjustment, setOpenAdjustment] = useState<AdjustmentKind | null>(null)
  const [adjustmentDraft, setAdjustmentDraft] = useState<AdjustmentLayer | null>(null)
  const handleAdjustmentPreview = useCallback((params: AdjustmentParams | null) => {
    if (params === null) {
      setAdjustmentDraft(null)
      return
    }
    setAdjustmentDraft({
      id: 'adjustment-draft',
      name: params.kind,
      visible: true,
      opacity: 100,
      blend: 'normal',
      kind: 'adjustment',
      params,
    })
  }, [])
  const handleAdjustmentApply = useCallback(
    (params: AdjustmentParams) => {
      commitLayer({
        id: crypto.randomUUID(),
        name: t(
          params.kind === 'channelMixer'
            ? 'pages.imageEditor.adjustments.channelMixer.title'
            : `pages.imageEditor.adjustments.${params.kind}`,
        ),
        visible: true,
        opacity: 100,
        blend: 'normal',
        kind: 'adjustment',
        params,
      })
      setAdjustmentDraft(null)
      setOpenAdjustment(null)
    },
    [commitLayer, t],
  )
  const handleAdjustmentCancel = useCallback(() => {
    setAdjustmentDraft(null)
    setOpenAdjustment(null)
  }, [])

  // ── Filter dialog ──────────────────────────────────────────────────────
  // Mirror of the Adjustments dialog flow, but for FilterLayer. extraPreviewLayer
  // on Canvas takes the live draft so the user sees the filter applied as
  // they tweak; on Apply, the draft is committed via commitLayer (which bakes
  // in any active selection clip). Filters take widthxheight so the work runs
  // through applyPixelTransformLayer; the dialog shape is otherwise identical.
  const [openFilter, setOpenFilter] = useState<FilterKind | null>(null)
  const [filterDraft, setFilterDraft] = useState<FilterLayer | null>(null)
  const handleFilterPreview = useCallback((params: FilterParams | null) => {
    if (params === null) {
      setFilterDraft(null)
      return
    }
    setFilterDraft({
      id: 'filter-draft',
      name: params.kind,
      visible: true,
      opacity: 100,
      blend: 'normal',
      kind: 'filter',
      params,
    })
  }, [])
  const handleFilterApply = useCallback(
    (params: FilterParams) => {
      // Note: AddNoise's `seed` is set in the dialog at mount, so the params
      // passed in here already carry a stable seed — no apply-time fixup needed.
      // Smart Filters: if the selected layer is a SO, append the filter to
      // its bakedFilters stack instead of creating a separate FilterLayer.
      // PS semantics — filters live on the SO and stay non-destructive
      // (editable through the layer panel later).
      const selected =
        selectedLayerId && selectedLayerId !== 'image'
          ? findLayerById(state.layers, selectedLayerId)
          : null
      if (selected && selected.kind === 'smartObject') {
        const next: FilterParams[] = [...(selected.bakedFilters ?? []), params]
        patchLayer(selected.id, { bakedFilters: next })
        setFilterDraft(null)
        setOpenFilter(null)
        toast.success(t('pages.imageEditor.smartFilters.added'))
        return
      }
      commitLayer({
        id: crypto.randomUUID(),
        name: t(`pages.imageEditor.filters.${params.kind}`),
        visible: true,
        opacity: 100,
        blend: 'normal',
        kind: 'filter',
        params,
      })
      setFilterDraft(null)
      setOpenFilter(null)
    },
    [commitLayer, selectedLayerId, state.layers, patchLayer, t],
  )
  const handleFilterCancel = useCallback(() => {
    setFilterDraft(null)
    setOpenFilter(null)
  }, [])

  // ── Layer Style dialog ────────────────────────────────────────────────
  // `openLayerStyle` is { layerId, kind? } — opens the modal targeting that
  // layer (defaulting to the currently selected layer when invoked from the
  // menu). On Apply we patch the layer's `effects` and clear any legacy
  // `shadow` so the two don't double-render.
  const [openLayerStyle, setOpenLayerStyle] = useState<{
    layerId: string
    kind?: LayerEffectKind
  } | null>(null)
  const handleOpenLayerStyle = useCallback(
    (kind?: LayerEffectKind) => {
      // Image background can't carry effects (no overlay surface in its render
      // path). Adjustment / filter / mask layers also can't render effects —
      // they consume pixels rather than emit their own. Silently no-op rather
      // than presenting a dialog that won't visibly do anything.
      if (!selectedLayerId || selectedLayerId === 'image') return
      const target = findLayerById(state.layers, selectedLayerId)
      if (!target) return
      if (
        target.kind !== 'annotation' &&
        target.kind !== 'group' &&
        target.kind !== 'smartObject'
      ) {
        toast.message(t('pages.imageEditor.layerStyle.unsupportedKind'))
        return
      }
      setOpenLayerStyle({ layerId: selectedLayerId, kind })
    },
    [selectedLayerId, state.layers, t],
  )
  const layerStyleTarget: Layer | null = openLayerStyle
    ? findLayerById(state.layers, openLayerStyle.layerId)
    : null
  const layerStyleInitial: LayerEffect[] = layerStyleTarget?.effects ?? []
  // ── Right-click context menus ─────────────────────────────────────────
  // Single shared open-menu state; either layer (LayersPanel row) or canvas
  // (in-canvas right-click). When both kinds need to differ in items, we
  // dispatch via `source` here without two separate state machines.
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    items: ContextMenuItem[]
    header?: string
  } | null>(null)
  const openLayerContextMenu = useCallback(
    (id: string, x: number, y: number) => {
      const target = findLayerById(state.layers, id)
      if (!target) return
      const isSO = target.kind === 'smartObject'
      const isGroupTarget = target.kind === 'group'
      const canHaveFx =
        target.kind === 'annotation' || isSO || isGroupTarget
      const items: ContextMenuItem[] = [
        {
          id: 'ls',
          label: t('pages.imageEditor.layerStyle.title') + '…',
          onClick: () => {
            setSelectedLayerId(id)
            setOpenLayerStyle({ layerId: id })
          },
          disabled: !canHaveFx,
        },
        { sep: true },
        {
          id: 'dup',
          label: t('pages.imageEditor.menu.duplicateLayer'),
          shortcut: '⌘J',
          onClick: () => duplicateRef.current(),
        },
        {
          id: 'del',
          label: t('pages.imageEditor.menu.deleteLayer'),
          shortcut: '⌫',
          onClick: () => deleteLayerRef.current(),
          danger: true,
        },
        { sep: true },
        {
          id: 'convertSO',
          label: t('pages.imageEditor.menu.convertToSmartObject'),
          onClick: handleConvertToSmartObject,
          disabled: isSO,
        },
        {
          id: 'replaceSO',
          label: t('pages.imageEditor.menu.replaceSmartObjectContents') + '…',
          onClick: handleReplaceContents,
          disabled: !isSO,
        },
        { sep: true },
        {
          id: 'mergeDown',
          label: t('pages.imageEditor.menu.mergeDown'),
          shortcut: '⌘E',
          onClick: () => mergeDownRef.current(),
        },
        {
          id: 'mergeVisible',
          label: t('pages.imageEditor.menu.mergeVisible'),
          shortcut: '⇧⌘E',
          onClick: () => mergeVisibleRef.current(),
        },
      ]
      setContextMenu({ x, y, items, header: target.name })
    },
    [state.layers, t, handleConvertToSmartObject, handleReplaceContents],
  )

  const handleLayerStyleApply = useCallback(
    (next: LayerEffect[]) => {
      if (!openLayerStyle) return
      patchLayer(openLayerStyle.layerId, { effects: next, shadow: undefined })
      setOpenLayerStyle(null)
    },
    [openLayerStyle, patchLayer],
  )

  // ── Sample-pixel tools (Spot Heal / Clone Stamp / History Brush) ──────
  // All three are drag-paint: Canvas owns the snapshot + offscreen + stamp
  // loop; the parent's only jobs are the Clone Stamp source toast + the
  // "need source" hint when the user starts stamping without setting one.
  // (cloneSource state is declared above near the other tool-state hooks.)
  const handleSetCloneSource = useCallback(
    (p: Point) => {
      setCloneSource(p)
      toast.message(t('pages.imageEditor.cloneSourceSet'))
    },
    [t],
  )

  const handleCloneNeedSource = useCallback(
    () => toast.message(t('pages.imageEditor.cloneNeedSource')),
    [t],
  )

  // ── File handling ────────────────────────────────────────────────────────
  const acceptFile = useCallback(
    async (file: File) => {
      if (file.type === 'application/json' || /\.json$/i.test(file.name)) {
        try {
          const text = await file.text()
          const project = parseProject(text)
          const img = await loadImageFromUrl(project.source.dataUrl)
          setImage(img)
          setFilename(project.source.name.replace(/\.[^./]+$/, ''))
          // Preload Smart Object source dataUrls into the image cache so SO
          // layers render on first paint (otherwise renderSmartObjectLayer
          // sees an empty cache and silently no-ops until edits trigger a
          // re-render). Run in parallel; ignore individual failures so one
          // bad source doesn't block the project from loading.
          const sources = project.state.smartSources ?? {}
          for (const id of Object.keys(sources)) {
            ensureImage(sources[id].dataUrl).catch(() => {})
          }
          // Preload raster mask dataUrls — same reason as SO sources
          // (renderer needs them in the imageCache for first paint).
          for (const l of walkLayers(project.state.layers)) {
            if (l.kind === 'mask' && l.dataUrl) {
              ensureImage(l.dataUrl).catch(() => {})
            }
          }
          history.reset(project.state)
          setSelectedLayerId('image')
          toast.success(t('pages.imageEditor.projectLoaded'))
        } catch {
          toast.error(t('pages.imageEditor.projectInvalid'))
        }
        return
      }
      if (!file.type.startsWith('image/')) {
        toast.error(t('pages.imageEditor.errNotImage'))
        return
      }
      const url = URL.createObjectURL(file)
      try {
        const img = await loadImageFromUrl(url)
        setImage(img)
        setFilename(file.name.replace(/\.[^./]+$/, ''))
        history.reset(initialState())
        setSelectedLayerId('image')
        // Record in recent files. Build a small thumbnail + persist the
        // full dataUrl so re-opening doesn't need another file pick.
        try {
          const dataUrl = await fileToDataUrl(file)
          const thumb = makeThumbnail(img) ?? undefined
          const next = addRecentFile({
            name: file.name,
            dataUrl,
            thumbnail: thumb,
          })
          setRecentFiles(next)
        } catch {
          // Quota or read error — recent-files is non-essential, don't
          // surface to user.
        }
      } catch {
        toast.error(t('pages.imageEditor.errLoadFailed'))
      } finally {
        URL.revokeObjectURL(url)
      }
    },
    [history, t, ensureImage],
  )

  const replaceInputRef = useRef<HTMLInputElement | null>(null)

  const handleDropImage = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        toast.error(t('pages.imageEditor.errNotImage'))
        return
      }
      try {
        const dataUrl = await fileToDataUrl(file)
        const img = await ensureImage(dataUrl)
        if (!image) return
        const { baseW, baseH } = dimsAfterRotation(image, state)
        const previewScale = Math.min(1, PREVIEW_MAX / Math.max(baseW, baseH, 1))
        const previewW = baseW * previewScale
        const previewH = baseH * previewScale
        const target = Math.min(previewW, previewH) / 2
        const ratio = img.naturalWidth / Math.max(img.naturalHeight, 1)
        const w = ratio >= 1 ? target * ratio : target
        const h = ratio >= 1 ? target : target / ratio
        const x = previewW / 2 - w / 2
        const y = previewH / 2 - h / 2
        const layer: AnnotationLayer = {
          id: crypto.randomUUID(),
          name: file.name.replace(/\.[^./]+$/, '') || 'Image',
          visible: true,
          opacity: 100,
          blend: 'normal',
          kind: 'annotation',
          shape: { kind: 'image', x, y, w, h, dataUrl },
        }
        commitLayer(layer)
        toast.success(t('pages.imageEditor.droppedAsLayer', { name: layer.name }))
      } catch {
        toast.error(t('pages.imageEditor.errLoadFailed'))
      }
    },
    [ensureImage, image, state, commitLayer, t],
  )

  const handlePickColor = useCallback(
    (hex: string) => setColors((c) => ({ ...c, fg: hex })),
    [],
  )

  /**
   * Paint Bucket flood fill at `previewPoint` (preview-pixel space). Renders
   * the current editor state at source resolution, runs a 4-connected
   * scanline flood fill from the click point, builds an FG-coloured bitmap
   * of the matching region, and commits it as a new image-shape layer.
   */
  const handleBucketFill = useCallback(
    async (previewPoint: { x: number; y: number }) => {
      if (!image) return
      const { baseW, baseH } = dimsAfterRotation(image, state)
      const previewScale = Math.min(1, PREVIEW_MAX / Math.max(baseW, baseH, 1))

      // The preview canvas is the cropped region's preview-pixel size when a
      // crop is active. Re-render at source resolution (scale=1) so the
      // flood fill operates on the true image.
      const srcCanvas = document.createElement('canvas')
      renderTo(srcCanvas, { image, state, scale: 1, previewScale, imageCache })
      const ctx = srcCanvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return

      // Convert click from preview-pixel to source-pixel space. When a crop
      // is active, shape coords are post-crop preview pixels — shift back by
      // the crop origin and scale to source.
      const cropOriginX = state.cropRect
        ? Math.min(state.cropRect.x, state.cropRect.x + state.cropRect.w)
        : 0
      const cropOriginY = state.cropRect
        ? Math.min(state.cropRect.y, state.cropRect.y + state.cropRect.h)
        : 0
      const sx = Math.round((previewPoint.x + cropOriginX) / previewScale)
      const sy = Math.round((previewPoint.y + cropOriginY) / previewScale)

      let imageData: ImageData
      try {
        imageData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height)
      } catch {
        toast.error(t('pages.imageEditor.errBucketRead'))
        return
      }

      const mask = floodFillMask(imageData, sx, sy, bucketTolerance)
      let any = false
      for (let i = 0; i < mask.length; i++) {
        if (mask[i]) {
          any = true
          break
        }
      }
      if (!any) {
        toast.message(t('pages.imageEditor.bucketEmpty'))
        return
      }

      const dataUrl = maskToDataUrl(mask, srcCanvas.width, srcCanvas.height, colors.fg)
      if (!dataUrl) return
      await ensureImage(dataUrl)

      const fullPreviewW = baseW * previewScale
      const fullPreviewH = baseH * previewScale
      const layer: AnnotationLayer = {
        id: crypto.randomUUID(),
        name: t('pages.imageEditor.annoLabel.bucket'),
        visible: true,
        opacity: 100,
        blend: 'normal',
        kind: 'annotation',
        shape: { kind: 'image', x: 0, y: 0, w: fullPreviewW, h: fullPreviewH, dataUrl },
      }
      commitLayer(layer)
    },
    [image, state, imageCache, colors.fg, bucketTolerance, ensureImage, commitLayer, t],
  )

  /**
   * Commit a gradient drag — paints a linear gradient from FG (at `start`)
   * to BG (at `end`) onto a source-resolution canvas, then commits as a new
   * image-shape layer covering the full preview canvas.
   */
  const handleCommitGradient = useCallback(
    async (start: { x: number; y: number }, end: { x: number; y: number }) => {
      if (!image) return
      const { baseW, baseH } = dimsAfterRotation(image, state)
      const previewScale = Math.min(1, PREVIEW_MAX / Math.max(baseW, baseH, 1))
      const cropOriginX = state.cropRect
        ? Math.min(state.cropRect.x, state.cropRect.x + state.cropRect.w)
        : 0
      const cropOriginY = state.cropRect
        ? Math.min(state.cropRect.y, state.cropRect.y + state.cropRect.h)
        : 0
      const sx0 = (start.x + cropOriginX) / previewScale
      const sy0 = (start.y + cropOriginY) / previewScale
      const sx1 = (end.x + cropOriginX) / previewScale
      const sy1 = (end.y + cropOriginY) / previewScale

      const canvas = document.createElement('canvas')
      canvas.width = baseW
      canvas.height = baseH
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const grad = ctx.createLinearGradient(sx0, sy0, sx1, sy1)
      grad.addColorStop(0, colors.fg)
      grad.addColorStop(1, colors.bg)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, baseW, baseH)
      const dataUrl = canvas.toDataURL('image/png')
      await ensureImage(dataUrl)

      const fullPreviewW = baseW * previewScale
      const fullPreviewH = baseH * previewScale
      const layer: AnnotationLayer = {
        id: crypto.randomUUID(),
        name: t('pages.imageEditor.annoLabel.gradient'),
        visible: true,
        opacity: 100,
        blend: 'normal',
        kind: 'annotation',
        shape: { kind: 'image', x: 0, y: 0, w: fullPreviewW, h: fullPreviewH, dataUrl },
      }
      commitLayer(layer)
    },
    [image, state, colors.fg, colors.bg, ensureImage, commitLayer, t],
  )

  // ── Download / save ──────────────────────────────────────────────────────
  /**
   * Render and download the current canvas in the requested format. If
   * `format` is omitted, falls back to the most recently chosen format
   * (defaults to PNG).
   */
  const exportImage = useCallback(
    async (format?: OutputFormat) => {
      if (!image || !canvasRef.current) return
      const fmt = format ?? outFormat
      if (format) setOutFormat(format)
      const exportCanvas = document.createElement('canvas')
      canvasRef.current.exportTo(exportCanvas)
      const mime =
        fmt === 'png' ? 'image/png' : fmt === 'jpeg' ? 'image/jpeg' : 'image/webp'
      const ext = fmt === 'jpeg' ? 'jpg' : fmt
      const quality = fmt === 'png' ? undefined : outQuality / 100
      const blob: Blob | null = await new Promise((resolve) =>
        exportCanvas.toBlob((b) => resolve(b), mime, quality),
      )
      if (!blob) {
        toast.error(t('pages.imageEditor.errExport'))
        return
      }
      triggerDownload(blob, `${filename}_edited.${ext}`)
      toast.success(t('pages.imageEditor.downloaded', { format: fmt.toUpperCase() }))
    },
    [image, outFormat, outQuality, filename, t],
  )
  const handleDownload = useCallback(() => exportImage(), [exportImage])

  /**
   * Re-export using a saved preset: render the canvas at the preset's
   * scale, encode as its format/quality, and download with the preset's
   * filename pattern. The native canvas is rendered once at scale=1 (via
   * the same exportTo path the other export handlers use) and then
   * upscaled / downscaled into the destination canvas via drawImage —
   * cheap, and avoids re-running the full layer compositor at a custom
   * preview scale.
   */
  const handleExportWithPreset = useCallback(
    async (id: string) => {
      if (!image || !canvasRef.current) return
      const preset = exportPresets.find((p) => p.id === id)
      if (!preset) return
      const intermediate = document.createElement('canvas')
      canvasRef.current.exportTo(intermediate)
      const dst = document.createElement('canvas')
      dst.width = Math.max(1, Math.round(intermediate.width * preset.scale))
      dst.height = Math.max(1, Math.round(intermediate.height * preset.scale))
      const ctx = dst.getContext('2d')
      if (!ctx) return
      ctx.drawImage(intermediate, 0, 0, dst.width, dst.height)
      const mime =
        preset.format === 'png'
          ? 'image/png'
          : preset.format === 'jpeg'
            ? 'image/jpeg'
            : 'image/webp'
      const ext = preset.format === 'jpeg' ? 'jpg' : preset.format
      const quality = preset.format === 'png' ? undefined : preset.quality / 100
      const blob: Blob | null = await new Promise((resolve) =>
        dst.toBlob((b) => resolve(b), mime, quality),
      )
      if (!blob) {
        toast.error(t('pages.imageEditor.errExport'))
        return
      }
      const name = applyFilenamePattern(preset.filenamePattern, {
        name: filename,
        scale: preset.scale,
        ext,
      })
      triggerDownload(blob, name)
      toast.success(
        t('pages.imageEditor.downloaded', { format: preset.format.toUpperCase() }),
      )
    },
    [image, exportPresets, filename, t],
  )

  const handleNewDocument = useCallback(
    async (args: { w: number; h: number; bgColor: string }) => {
      const c = document.createElement('canvas')
      c.width = args.w
      c.height = args.h
      const ctx = c.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = args.bgColor
      ctx.fillRect(0, 0, args.w, args.h)
      try {
        const img = await loadImageFromUrl(c.toDataURL('image/png'))
        setImage(img)
        setFilename('untitled')
        history.reset(initialState())
        setSelectedLayerId('image')
        setNewDocOpen(false)
        toast.success(t('pages.imageEditor.newDoc.created'))
      } catch {
        toast.error(t('pages.imageEditor.errLoadFailed'))
      }
    },
    [history, t],
  )

  const [saveForWebOpen, setSaveForWebOpen] = useState(false)
  // Increment-on-open counter that re-keys the SaveForWeb dialog so its
  // internal full-resolution canvas is freshly painted from current
  // editor state every time it opens. Without this the dialog cached
  // the canvas from first open and showed stale previews on reopen.
  const [saveForWebOpenSeq, setSaveForWebOpenSeq] = useState(0)
  const renderExportTo = useCallback(
    (c: HTMLCanvasElement) => canvasRef.current?.exportTo(c),
    [],
  )
  const handleSaveForWebSave = useCallback(
    (args: { format: OutputFormat; quality: number; blob: Blob }) => {
      setOutFormat(args.format)
      setOutQuality(args.quality)
      const ext = args.format === 'jpeg' ? 'jpg' : args.format
      triggerDownload(args.blob, `${filename}_edited.${ext}`)
      toast.success(t('pages.imageEditor.downloaded', { format: args.format.toUpperCase() }))
      setSaveForWebOpen(false)
    },
    [filename, t],
  )

  const handleSaveProject = useCallback(() => {
    if (!image) return
    const blob = serializeProject({ image, filename, state })
    const downloadName = `${filename}.toolbox-image.json`
    triggerDownload(blob, downloadName)
    // Explicit save invalidates the autosave snapshot — the user now has
    // a real file. If they re-edit and crash again we'll rebuild it.
    clearAutosave()
    toast.success(t('pages.imageEditor.projectSavedAs', { name: downloadName }))
  }, [image, filename, state, t])
  useEffect(() => {
    // Ref-update for the Ctrl+S keyboard shortcut. Lives here (after the
    // handler declaration) so React's hook-static-analysis doesn't flag
    // "used before declared" — the earlier ref-batch effect is hoisted
    // above the function declaration.
    saveProjectRef.current = handleSaveProject
  })

  const setTransforms = useCallback(
    (transforms: Transforms) => history.set({ ...state, transforms }),
    [history, state],
  )

  // ── Render ───────────────────────────────────────────────────────────────
  // Empty state — drop zone, no shell.
  if (!image) {
    return (
      <div className="mx-auto max-w-5xl px-8 py-12">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('tools.image-editor.name')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('pages.imageEditor.description')}
          </p>
        </header>
        {autosaveRestore && (
          <div className="mb-4 flex items-center justify-between rounded border border-primary/40 bg-accent/30 p-3 text-sm">
            <span>
              {t('pages.imageEditor.autosaveAvailable', {
                name: autosaveRestore.source.name,
                ago: timeAgo(autosaveRestore.autosavedAt),
              })}
            </span>
            <span className="flex gap-2">
              <button
                className="rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent/40"
                onClick={async () => {
                  try {
                    const img = await loadImageFromUrl(autosaveRestore.source.dataUrl)
                    setImage(img)
                    setFilename(autosaveRestore.source.name.replace(/\.[^./]+$/, ''))
                    history.reset(autosaveRestore.state)
                    setSelectedLayerId('image')
                    setAutosaveRestore(null)
                    toast.success(t('pages.imageEditor.autosaveRestored'))
                  } catch {
                    toast.error(t('pages.imageEditor.errLoadFailed'))
                  }
                }}
              >
                {t('pages.imageEditor.autosaveRestore')}
              </button>
              <button
                className="rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent/40"
                onClick={() => {
                  clearAutosave()
                  setAutosaveRestore(null)
                }}
              >
                {t('pages.imageEditor.autosaveDismiss')}
              </button>
            </span>
          </div>
        )}
        <DropZone onFile={acceptFile} />
      </div>
    )
  }

  const rootClass = focused
    ? 'pf-root fixed inset-0 z-50 h-svh w-svw'
    : 'pf-root h-[calc(100svh-3.5rem)] w-full'

  // OptionsBar reflects whichever the user thinks the active tool is —
  // if pan mode is on (Space held), keep showing the underlying tool.
  return (
    <div className={rootClass}>
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*,application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) acceptFile(f)
          e.target.value = ''
        }}
      />

      <div className="pf-shell">
        <MenuBar
          handlers={{
            open: () => replaceInputRef.current?.click(),
            newDocument: () => setNewDocOpen(true),
            recentFiles: recentFiles.map((r) => ({ name: r.name })),
            onOpenRecent: async (i) => {
              const entry = recentFiles[i]
              if (!entry) return
              try {
                const img = await loadImageFromUrl(entry.dataUrl)
                setImage(img)
                setFilename(entry.name.replace(/\.[^./]+$/, ''))
                history.reset(initialState())
                setSelectedLayerId('image')
                // Bump the entry to the top of the list (LRU).
                setRecentFiles(addRecentFile({
                  name: entry.name,
                  dataUrl: entry.dataUrl,
                  thumbnail: entry.thumbnail,
                }))
                toast.success(t('pages.imageEditor.recentReopened', { name: entry.name }))
              } catch {
                toast.error(t('pages.imageEditor.errLoadFailed'))
              }
            },
            save: handleSaveProject,
            download: handleDownload,
            exportPng: () => exportImage('png'),
            exportJpeg: () => exportImage('jpeg'),
            exportWebp: () => exportImage('webp'),
            exportPresets: exportPresets.map((p) => ({ id: p.id, name: p.name })),
            onExportWithPreset: handleExportWithPreset,
            saveForWeb: () => {
              setSaveForWebOpenSeq((n) => n + 1)
              setSaveForWebOpen(true)
            },
            undo: () => {
              if (!history.canUndo) return
              history.undo()
              toast.message(t('pages.imageEditor.undid'))
            },
            redo: () => {
              if (!history.canRedo) return
              history.redo()
              toast.message(t('pages.imageEditor.redid'))
            },
            canUndo: history.canUndo,
            canRedo: history.canRedo,
            rotate90: () =>
              setTransforms({
                ...state.transforms,
                rotation: ((state.transforms.rotation + 90) % 360) as 0 | 90 | 180 | 270,
              }),
            flipH: () => setTransforms({ ...state.transforms, flipH: !state.transforms.flipH }),
            flipV: () => setTransforms({ ...state.transforms, flipV: !state.transforms.flipV }),
            rotateArbitrary: () => setRotateOpen(true),
            imageSize: () => setImageSizeOpen(true),
            canvasSize: () => setCanvasSizeOpen(true),
            trim: handleTrim,
            revealAll: handleRevealAll,
            openAdjustment: (kind: AdjustmentKind) => setOpenAdjustment(kind),
            openFilter: (kind: FilterKind) => setOpenFilter(kind),
            // Parameter-free adjustments commit immediately (no dialog).
            applyEqualize: () => handleAdjustmentApply({ kind: 'equalize' }),
            applySolarize: () => handleAdjustmentApply({ kind: 'solarize', threshold: 128 }),
            openReplaceColor: handleOpenReplaceColor,
            duplicateLayer: () => duplicateRef.current(),
            deleteLayer: () => deleteLayerRef.current(),
            newGroup,
            groupSelected,
            ungroupSelected,
            canGroupSelected,
            canUngroupSelected,
            selectAll: handleSelectAll,
            deselect: handleDeselect,
            reselect: handleReselect,
            inverseSelection: handleInverse,
            selectExpand: () => setSelectModifyOp('expand'),
            selectContract: () => setSelectModifyOp('contract'),
            selectFeather: () => setSelectModifyOp('feather'),
            selectSmooth: () => setSelectModifyOp('smooth'),
            selectGrow: handleSelectGrow,
            selectColorRange: handleOpenColorRange,
            selectSubject: handleSelectSubject,
            removeBackground: handleRemoveBackground,
            canDeselect: hasSelection,
            canReselect,
            canModifySelection: hasSelection,
            canSelectFromImage: !!image,
            cut: handleCut,
            copy: handleCopy,
            copyMerged: handleCopyMerged,
            paste: handlePaste,
            pasteInPlace: handlePasteInPlace,
            fill: () => setFillOpen(true),
            stroke: () => setStrokeOpen(true),
            canPaste: !!clipboard,
            mergeDown: handleMergeDown,
            mergeVisible: handleMergeVisible,
            stampVisible: handleStampVisible,
            flatten: handleFlatten,
            convertToSmartObject: handleConvertToSmartObject,
            replaceSmartObjectContents: handleReplaceContents,
            isSmartObjectSelected:
              !!selectedLayerId &&
              selectedLayerId !== 'image' &&
              findLayerById(state.layers, selectedLayerId)?.kind === 'smartObject',
            toggleClippingMask: handleToggleClippingMask,
            isClippingMaskSelected:
              !!selectedLayerId &&
              selectedLayerId !== 'image' &&
              !!findLayerById(state.layers, selectedLayerId)?.clipping,
            newRasterMask: handleNewRasterMask,
            convertMaskToRaster: handleConvertMaskToRaster,
            isRectMaskSelected: (() => {
              if (!selectedLayerId || selectedLayerId === 'image') return false
              const l = findLayerById(state.layers, selectedLayerId)
              return !!l && l.kind === 'mask' && !l.dataUrl
            })(),
            addAdjustmentMask: handleAddAdjustmentMask,
            isAdjustmentOrFilterSelected: (() => {
              if (!selectedLayerId || selectedLayerId === 'image') return false
              const l = findLayerById(state.layers, selectedLayerId)
              return !!l && (l.kind === 'adjustment' || l.kind === 'filter') && !l.maskDataUrl
            })(),
            removeMask: handleRemoveMask,
            canRemoveMask: (() => {
              if (!selectedLayerId || selectedLayerId === 'image') return false
              const l = findLayerById(state.layers, selectedLayerId)
              if (!l) return false
              if (l.kind === 'mask') return true
              if ((l.kind === 'adjustment' || l.kind === 'filter') && l.maskDataUrl) return true
              return false
            })(),
            applyMask: handleApplyMask,
            canApplyMask: (() => {
              if (!selectedLayerId || selectedLayerId === 'image') return false
              const l = findLayerById(state.layers, selectedLayerId)
              return !!l && l.kind === 'mask'
            })(),
            openLayerStyle: handleOpenLayerStyle,
            typeOnPath: handleTypeOnPath,
            canTypeOnPath,
            warpText: handleOpenWarpText,
            canWarpText,
            zoomIn,
            zoomOut,
            zoomFit: zoomReset,
            zoomActualPixels,
            zoomFitScreen,
            toggleGrid: () => setShowGrid((v) => !v),
            toggleSnap: () => setSnapToGrid((v) => !v),
            showGrid,
            snapToGrid,
            toggleRulers: () => setShowRulers((v) => !v),
            showRulers,
            toggleGuides: () => setShowGuides((v) => !v),
            showGuides,
            clearGuides: handleClearGuides,
            hasGuides: !!state.guides && (state.guides.h.length + state.guides.v.length > 0),
            toggleFocus: () => setFocused((v) => !v),
          }}
        />

        <OptionsBar
          tool={tool}
          fgColor={colors.fg}
          setFgColor={(c) => setColors((s) => ({ ...s, fg: c }))}
          bgColor={colors.bg}
          setBgColor={(c) => setColors((s) => ({ ...s, bg: c }))}
          strokeWidth={strokeWidth}
          setStrokeWidth={setStrokeWidth}
          brushOptions={brushOptions}
          setBrushOptions={setBrushOptions}
          textOptions={textOptions}
          setTextOptions={setTextOptions}
          bucketTolerance={bucketTolerance}
          setBucketTolerance={setBucketTolerance}
          wandTolerance={wandTolerance}
          setWandTolerance={setWandTolerance}
          liquifyActive={!!liquifyCanvas}
          liquifyMode={liquifyMode}
          setLiquifyMode={setLiquifyMode}
          liquifySize={liquifySize}
          setLiquifySize={setLiquifySize}
          liquifyStrength={liquifyStrength}
          setLiquifyStrength={setLiquifyStrength}
          onApplyLiquify={handleApplyLiquify}
          onCancelLiquify={handleCancelLiquify}
          selectionMode={selectionMode}
          setSelectionMode={setSelectionMode}
          feather={featherOption}
          setFeather={setFeatherOption}
          isStubTool={STUB_TOOLS.has(tool)}
          hasActiveCrop={!!state.cropRect}
          cropPending={cropPending}
          onCropApply={() => canvasRef.current?.commitPendingCrop()}
          onCropCancel={() => canvasRef.current?.cancelPendingCrop()}
          onClearCrop={handleClearCrop}
          cropAspectId={cropAspectId}
          setCropAspectId={setCropAspectId}
          hasSelection={!!state.selection}
          onClearSelection={() =>
            history.set({ ...state, selection: undefined, selectionPath: undefined })
          }
        />

        <ToolsPalette
          tool={tool}
          setTool={trySetTool}
          fgColor={colors.fg}
          bgColor={colors.bg}
          setFgColor={(c) => setColors((s) => ({ ...s, fg: c }))}
          setBgColor={(c) => setColors((s) => ({ ...s, bg: c }))}
          swapColors={swapColors}
          resetColors={resetColors}
          onStubClick={stubMsg}
          onOpenColorPicker={(which) => setColorPicker(which)}
        />

        <div className="pf-canvas-wrap">
          <div className="pf-tabs">
            <div className="pf-tab pf-active">
              <span className="pf-tab-title">{filename} · RGB/8</span>
            </div>
            {state.cropRect && (
              <div
                className="pf-tab"
                onClick={handleClearCrop}
                title={t('pages.imageEditor.cropClear')}
                style={{ color: 'var(--pf-fg-mid)' }}
              >
                <span className="pf-tab-title">✕ {t('pages.imageEditor.cropClear')}</span>
              </div>
            )}
            <div style={{ flex: 1, background: 'var(--pf-bg-1)' }} />
            <div
              className="pf-tab"
              onClick={() => setFocused((v) => !v)}
              title={t(focused ? 'pages.imageEditor.focusExitHint' : 'pages.imageEditor.focusEnterHint')}
              style={{
                color: '#fff',
                background: focused ? '#dc2626' : '#16a34a',
                fontWeight: 600,
                padding: '0 10px',
              }}
            >
              <span className="pf-tab-title">
                ⛶ {t(focused ? 'pages.imageEditor.exitFullscreen' : 'pages.imageEditor.fullscreen')}
              </span>
            </div>
          </div>

          <Workspace
            ref={workspaceRef}
            zoom={zoom}
            pan={pan}
            setPan={setPan}
            panMode={effectivePanMode}
            viewRotation={viewRotation}
            onWheelZoom={zoomAtPoint}
            onDropFile={handleDropImage}
          >
            <Canvas
              ref={canvasRef}
              image={image}
              state={displayState}
              tool={tool}
              toolColor={colors.fg}
              toolStrokeWidth={strokeWidth}
              brushOptions={brushOptions}
              textOptions={textOptions}
              selectedId={selectedLayerId}
              onSelect={setSelectedLayerId}
              onCommitLayer={commitLayer}
              onCommitLayerUpdate={commitLayerUpdate}
              panMode={effectivePanMode}
              imageCache={imageCache}
              onZoomAt={zoomAtPoint}
              onPickColor={handlePickColor}
              onCommitCrop={handleCommitCrop}
              onBucketClick={handleBucketFill}
              bucketTolerance={bucketTolerance}
              onCommitGradient={handleCommitGradient}
              onCommitSelection={handleCommitSelection}
              onCommitPolygonSelection={handleCommitPolygonSelection}
              selectionMode={selectionMode}
              onWandClick={handleWandClick}
              wandTolerance={wandTolerance}
              onCloneSetSource={handleSetCloneSource}
              cloneSource={cloneSource}
              onCloneNeedSource={handleCloneNeedSource}
              extraPreviewLayer={adjustmentDraft ?? filterDraft ?? undefined}
              showGrid={showGrid}
              gridStep={gridStep}
              showRulers={showRulers}
              showGuides={showGuides}
              guides={state.guides}
              onAddGuide={handleAddGuide}
              liquifyOverlay={liquifyCanvas}
              onLiquifyStamp={handleLiquifyStamp}
              liquifyTick={liquifyTick}
              quickMaskDataUrl={state.quickMask?.dataUrl}
              cropAspect={CROP_ASPECTS.find((a) => a.id === cropAspectId)?.ratio ?? undefined}
              onCursorMove={setCursor}
              onCropPendingChange={setCropPending}
              onUpdateQuickMaskDataUrl={async (dataUrl) => {
                if (!state.quickMask) return
                // Await load so the renderer's next pass sees the new
                // mask synchronously — without this, the overlay flashes
                // back to the pre-stroke state for one frame before
                // ensureImage's async resolve catches up.
                try {
                  await ensureImage(dataUrl)
                } catch {
                  /* keep mask anyway, render falls back */
                }
                history.set({
                  ...state,
                  quickMask: { ...state.quickMask, dataUrl },
                })
              }}
            />
          </Workspace>
        </div>

        <RightSidebar
          state={state}
          selectedId={selectedLayerId}
          onSelect={setSelectedLayerId}
          setLayers={setLayers}
          patchLayer={patchLayer}
          patchImageLayer={patchImageLayer}
          deleteLayer={deleteLayer}
          setTransforms={setTransforms}
          setAdjust={(adjust) => history.set({ ...state, adjust })}
          zoom={zoom}
          onOpenStyle={(id) => {
            setSelectedLayerId(id)
            setOpenLayerStyle({ layerId: id })
          }}
          onReplaceSmartObjectContents={handleReplaceContents}
          onLayerContextMenu={openLayerContextMenu}
          onMakeWorkPath={() => {
            const layer = makeWorkPathLayer(state, t('pages.imageEditor.annoLabel.workPath'))
            if (!layer) {
              toast.message(t('pages.imageEditor.paths.noSelection'))
              return
            }
            commitLayer(layer)
            toast.success(t('pages.imageEditor.paths.workPathCreated'))
          }}
          onMakeSelectionFromPath={() => {
            if (!selectedLayerId || selectedLayerId === 'image') return
            const layer = findLayerById(state.layers, selectedLayerId)
            if (!layer || layer.kind !== 'annotation' || layer.shape.kind !== 'path') {
              toast.message(t('pages.imageEditor.paths.notAPath'))
              return
            }
            const result = selectionFromPath(layer.shape)
            if (!result) {
              toast.message(t('pages.imageEditor.paths.emptyPath'))
              return
            }
            history.set({
              ...state,
              selection: result.bbox,
              selectionPath: result.path,
              selectionInverse: false,
            })
            toast.success(t('pages.imageEditor.paths.selectionFromPathCreated'))
          }}
          onAddMaskToLayer={(id) => {
            // Inline +Mask from a row. Select first so the existing
            // handlers operate on the right layer; then dispatch the
            // appropriate variant by kind (adjustment / filter → embed
            // maskDataUrl; everything else → new MaskLayer above).
            setSelectedLayerId(id)
            const target = findLayerById(state.layers, id)
            if (!target) return
            if (target.kind === 'adjustment' || target.kind === 'filter') {
              void handleAddAdjustmentMask()
            } else {
              void handleNewRasterMask()
            }
          }}
          image={image}
          imageCache={imageCache}
          history={{
            totalLength: history.totalLength,
            currentIndex: history.currentIndex,
            jumpTo: history.jumpTo,
          }}
          onSaveLayerComp={handleSaveLayerComp}
          onApplyLayerComp={handleApplyLayerComp}
          onDeleteLayerComp={handleDeleteLayerComp}
          currentBrush={{ strokeWidth, options: brushOptions }}
          customBrushPresets={customBrushPresets}
          onPickBrushPreset={(p) => {
            setStrokeWidth(p.strokeWidth)
            setBrushOptions(p.options)
          }}
          onSaveCurrentBrush={(name) => {
            const preset: BrushPreset = {
              id: crypto.randomUUID(),
              name,
              strokeWidth,
              options: { ...brushOptions },
            }
            const next = [...customBrushPresets, preset]
            setCustomBrushPresets(next)
            saveCustomBrushPresets(next)
          }}
          onDeleteCustomBrush={(id) => {
            const next = customBrushPresets.filter((p) => p.id !== id)
            setCustomBrushPresets(next)
            saveCustomBrushPresets(next)
          }}
          onImportBrushTip={handleImportBrushTip}
          actions={state.actions ?? []}
          isActionRecording={actionHandlers.isRecording}
          actionRecordingName={actionHandlers.recordingName}
          actionRecordingStepCount={actionHandlers.stepCount}
          onSaveActionSnapshot={actionHandlers.handleSaveSnapshot}
          onStartActionRecording={actionHandlers.handleStartRecording}
          onStopActionRecording={actionHandlers.handleStopRecording}
          onCancelActionRecording={actionHandlers.handleCancelRecording}
          onPlayAction={actionHandlers.handlePlayAction}
          onDeleteAction={actionHandlers.handleDeleteAction}
        />

        <StatusBar
          width={image.naturalWidth}
          height={image.naturalHeight}
          zoom={zoom}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onZoomReset={zoomReset}
          tool={panMode ? 'none' : tool}
          cursor={cursor}
          selection={state.selection ?? null}
          layerCount={countAllLayers(state.layers)}
        />
      </div>

      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <AdjustmentDialog
        open={openAdjustment}
        onPreview={handleAdjustmentPreview}
        onApply={handleAdjustmentApply}
        onCancel={handleAdjustmentCancel}
      />
      <WarpTextDialog
        open={warpTarget !== null}
        initial={warpTarget?.initial ?? NONE_WARP}
        onPreview={handleWarpPreview}
        onApply={handleWarpApply}
        onCancel={handleWarpCancel}
      />
      <FilterDialog
        open={openFilter}
        onPreview={handleFilterPreview}
        onApply={handleFilterApply}
        onCancel={handleFilterCancel}
      />
      <SelectModifyDialog
        open={selectModifyOp}
        onApply={handleSelectModifyApply}
        onCancel={() => setSelectModifyOp(null)}
      />
      <ColorRangeDialog
        open={!!colorRangeSource}
        source={colorRangeSource}
        onApply={handleColorRangeApply}
        onCancel={() => setColorRangeSource(null)}
      />
      <ReplaceColorDialog
        open={!!replaceColorSource}
        source={replaceColorSource}
        onApply={handleReplaceColorApply}
        onCancel={() => setReplaceColorSource(null)}
      />
      <FillDialog
        open={fillOpen}
        fgColor={colors.fg}
        bgColor={colors.bg}
        onApply={handleFillApply}
        onCancel={() => setFillOpen(false)}
      />
      <StrokeDialog
        open={strokeOpen}
        fgColor={colors.fg}
        onApply={handleStrokeApply}
        onCancel={() => setStrokeOpen(false)}
      />
      <LayerStyleDialog
        open={!!openLayerStyle}
        initial={layerStyleInitial}
        initialKind={openLayerStyle?.kind}
        onApply={handleLayerStyleApply}
        onCancel={() => setOpenLayerStyle(null)}
      />
      {image && (
        <ImageSizeDialog
          open={imageSizeOpen}
          current={{ w: image.naturalWidth, h: image.naturalHeight }}
          onApply={handleImageSizeApply}
          onCancel={() => setImageSizeOpen(false)}
        />
      )}
      {image && (
        <CanvasSizeDialog
          open={canvasSizeOpen}
          current={{ w: image.naturalWidth, h: image.naturalHeight }}
          onApply={handleCanvasSizeApply}
          onCancel={() => setCanvasSizeOpen(false)}
        />
      )}
      <RotateArbitraryDialog
        open={rotateOpen}
        onApply={handleRotateArbitraryApply}
        onCancel={() => setRotateOpen(false)}
      />
      <NewDocumentDialog
        open={newDocOpen}
        onCreate={handleNewDocument}
        onCancel={() => setNewDocOpen(false)}
      />
      {image && (
        <SaveForWebDialog
          key={`sfw-${saveForWebOpenSeq}`}
          open={saveForWebOpen}
          initialFormat={outFormat}
          initialQuality={outQuality}
          renderToCanvas={renderExportTo}
          onSave={handleSaveForWebSave}
          onCancel={() => setSaveForWebOpen(false)}
        />
      )}
      <ColorPickerDialog
        open={colorPicker !== null}
        initial={colorPicker === 'bg' ? colors.bg : colors.fg}
        onApply={(hex) => {
          if (colorPicker === 'bg') setColors((s) => ({ ...s, bg: hex }))
          else if (colorPicker === 'fg') setColors((s) => ({ ...s, fg: hex }))
          setColorPicker(null)
        }}
        onCancel={() => setColorPicker(null)}
      />
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          header={contextMenu.header}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/** Lightweight one-shot file picker — programmatic alternative to wiring a
 *  hidden <input> element. Used by Smart Object > Replace Contents. */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

/**
 * If `layer` is a mask with a raster dataUrl, re-rasterize it onto a fresh
 * canvas of the new preview-pixel dims with the old content offset by
 * (dx, dy). Used after Canvas Size so masks align with the now-translated
 * layer geometry instead of stretching to fit. Other layer kinds pass
 * through unchanged.
 *
 * Reads from the existing imageCache (synchronous get); if the mask's
 * dataUrl hasn't loaded yet we leave it alone and trigger ensureImage
 * so the next render picks it up — caller should expect a brief beat
 * of misalignment in that edge case.
 */
function realignMaskOnCanvasResize(
  layer: Layer,
  imageCache: ImageCache | undefined,
  newW: number,
  newH: number,
  dx: number,
  dy: number,
  ensureImage: (dataUrl: string) => Promise<HTMLImageElement>,
): Layer {
  if (layer.kind === 'group') {
    return {
      ...layer,
      children: layer.children.map((c) =>
        realignMaskOnCanvasResize(c, imageCache, newW, newH, dx, dy, ensureImage),
      ),
    }
  }
  if (layer.kind !== 'mask' || !layer.dataUrl || !layer.w || !layer.h) return layer
  const cached = imageCache?.get(layer.dataUrl)
  if (!cached) {
    // Touch the cache so a future render gets it — but we can't rasterize
    // synchronously here, so the mask falls back to its stretched (wrong-
    // but-visible) state until a paint stroke replaces the dataUrl.
    ensureImage(layer.dataUrl).catch(() => {})
    return layer
  }
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(newW))
  c.height = Math.max(1, Math.round(newH))
  const ctx = c.getContext('2d')
  if (!ctx) return layer
  ctx.fillStyle = '#ffffff' // extended areas are visible by default
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(cached, dx, dy, layer.w, layer.h)
  try {
    const dataUrl = c.toDataURL('image/png')
    ensureImage(dataUrl).catch(() => {})
    return { ...layer, dataUrl, w: c.width, h: c.height }
  } catch {
    return layer
  }
}

/**
 * 9-point anchor → axis offset multiplier (0 = origin/start, 0.5 = centre,
 * 1 = far edge). Used by Canvas Size to position the old image inside the
 * new canvas bounds.
 */
function anchorOffset(anchor: Anchor9, axis: 'x' | 'y'): number {
  if (axis === 'x') {
    if (anchor === 'nw' || anchor === 'w' || anchor === 'sw') return 0
    if (anchor === 'n' || anchor === 'c' || anchor === 's') return 0.5
    return 1
  }
  if (anchor === 'nw' || anchor === 'n' || anchor === 'ne') return 0
  if (anchor === 'w' || anchor === 'c' || anchor === 'e') return 0.5
  return 1
}

/**
 * Scan `data` for the bounding rectangle of non-transparent pixels.
 * Returns null if everything is transparent (nothing to trim).
 */
function findTrimBBox(data: ImageData): { x: number; y: number; w: number; h: number } | null {
  const { width, height } = data
  const px = data.data
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = px[(y * width + x) * 4 + 3]
      if (a !== 0) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}
