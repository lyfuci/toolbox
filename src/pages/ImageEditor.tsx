import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AdjustmentDialog } from '@/components/image-editor/AdjustmentDialog'
import { Canvas, type CanvasHandle } from '@/components/image-editor/Canvas'
import { DropZone } from '@/components/image-editor/DropZone'
import { FillDialog } from '@/components/image-editor/FillDialog'
import { FilterDialog } from '@/components/image-editor/FilterDialog'
import { CanvasSizeDialog, type Anchor9 } from '@/components/image-editor/CanvasSizeDialog'
import { ColorPickerDialog } from '@/components/image-editor/ColorPickerDialog'
import { ContextMenu, type ContextMenuItem } from '@/components/image-editor/ContextMenu'
import { ImageSizeDialog } from '@/components/image-editor/ImageSizeDialog'
import { LayerStyleDialog } from '@/components/image-editor/LayerStyleDialog'
import { MenuBar } from '@/components/image-editor/MenuBar'
import { RotateArbitraryDialog } from '@/components/image-editor/RotateArbitraryDialog'
import { OptionsBar } from '@/components/image-editor/OptionsBar'
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
import { DEFAULT_BRUSH_OPTIONS, DEFAULT_TEXT_OPTIONS, initialState, PREVIEW_MAX } from '@/lib/image-editor/defaults'
import { fillSelection, strokeSelection, type StrokePosition } from '@/lib/image-editor/edit-ops'
import { floodFillMask, maskToDataUrl } from '@/lib/image-editor/flood-fill'
import { useHistoryState } from '@/lib/image-editor/history'
import { fileToDataUrl, useImageCache } from '@/lib/image-editor/image-cache'
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
  Point,
  Tool,
  Transforms,
} from '@/lib/image-editor/types'

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
  const [bucketTolerance, setBucketTolerance] = useState(32)
  const [wandTolerance, setWandTolerance] = useState(32)
  // Clone Stamp source point — set by Alt+click while the Stamp tool is
  // active, cleared whenever the user switches away from Stamp (handled in
  // trySetTool). Lives outside EditorState because it's transient UI state.
  const [cloneSource, setCloneSource] = useState<Point | null>(null)
  const [selectedLayerId, setSelectedLayerId] = useState<string>('image')

  const [outFormat, setOutFormat] = useState<OutputFormat>('png')
  const outQuality = 92

  const [focused, setFocused] = useState(false)
  const canvasRef = useRef<CanvasHandle | null>(null)
  const workspaceRef = useRef<WorkspaceHandle | null>(null)

  const { cache: imageCache, ensure: ensureImage } = useImageCache()

  // Ensure raster Layer Mask dataUrls are loaded into the imageCache so
  // the renderer's destination-in pass resolves them. ensureImage dedupes
  // via an inflight map so seen dataUrls don't re-fetch.
  useEffect(() => {
    for (const l of walkLayers(state.layers)) {
      if (l.kind === 'mask' && l.dataUrl) {
        ensureImage(l.dataUrl).catch(() => {})
      }
    }
  }, [state.layers, ensureImage])

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

  // View menu toggles (UI-only, not part of EditorState or project save).
  // Grid + snap travel together: snap is a no-op when the grid is hidden.
  const [showGrid, setShowGrid] = useState(false)
  const [snapToGrid, setSnapToGrid] = useState(false)
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
    },
    [stubMsg, t],
  )

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
      const partial =
        kind === 'expand'
          ? expandSelection(state, px, previewDims)
          : contractSelection(state, px)
      applySelection(partial)
      setSelectModifyOp(null)
    },
    [state, previewDims, applySelection],
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
        history.set({
          ...state,
          layers: state.layers.map((l) => translateLayer(l, dxPreview, dyPreview)),
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
    [image, state, history, t],
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
    (rect: { x: number; y: number; w: number; h: number }) => {
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
      history.set({ ...state, selection: { x: x0, y: y0, w, h }, selectionPath: undefined })
    },
    [history, state],
  )

  /**
   * Commit a polygon selection from Lasso / Polygonal Lasso. Points arrive in
   * cropped-canvas preview-pixel space; we shift each by the crop origin so
   * both `selection` (bbox) and `selectionPath` (outline) live in
   * original-image preview-pixel space — same convention as marquee.
   */
  const handleCommitPolygonSelection = useCallback(
    (points: Point[]) => {
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
      history.set({
        ...state,
        selection: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
        selectionPath: shifted,
      })
    },
    [history, state],
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

  const handleClearCrop = useCallback(() => {
    if (!state.cropRect) return
    history.set({ ...state, cropRect: undefined })
    toast.success(t('pages.imageEditor.cropCleared'))
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

  const handleSaveProject = useCallback(() => {
    if (!image) return
    const blob = serializeProject({ image, filename, state })
    triggerDownload(blob, `${filename}.toolbox-image.json`)
    toast.success(t('pages.imageEditor.projectSaved'))
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
            save: handleSaveProject,
            download: handleDownload,
            exportPng: () => exportImage('png'),
            exportJpeg: () => exportImage('jpeg'),
            exportWebp: () => exportImage('webp'),
            undo: history.undo,
            redo: history.redo,
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
            canDeselect: hasSelection,
            canReselect,
            canModifySelection: hasSelection,
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
            openLayerStyle: handleOpenLayerStyle,
            zoomIn,
            zoomOut,
            zoomFit: zoomReset,
            zoomActualPixels,
            zoomFitScreen,
            toggleGrid: () => setShowGrid((v) => !v),
            toggleSnap: () => setSnapToGrid((v) => !v),
            showGrid,
            snapToGrid,
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
          isStubTool={STUB_TOOLS.has(tool)}
          hasActiveCrop={!!state.cropRect}
          onClearCrop={handleClearCrop}
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
              state={state}
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
              onWandClick={handleWandClick}
              wandTolerance={wandTolerance}
              onCloneSetSource={handleSetCloneSource}
              cloneSource={cloneSource}
              onCloneNeedSource={handleCloneNeedSource}
              extraPreviewLayer={adjustmentDraft ?? filterDraft ?? undefined}
              showGrid={showGrid}
              gridStep={gridStep}
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
        />

        <StatusBar
          width={image.naturalWidth}
          height={image.naturalHeight}
          zoom={zoom}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onZoomReset={zoomReset}
          tool={panMode ? 'none' : tool}
        />
      </div>

      <AdjustmentDialog
        open={openAdjustment}
        onPreview={handleAdjustmentPreview}
        onApply={handleAdjustmentApply}
        onCancel={handleAdjustmentCancel}
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
