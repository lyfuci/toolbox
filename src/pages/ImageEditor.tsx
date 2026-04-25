import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Canvas, type CanvasHandle } from '@/components/image-editor/Canvas'
import { DropZone } from '@/components/image-editor/DropZone'
import { MenuBar } from '@/components/image-editor/MenuBar'
import { OptionsBar } from '@/components/image-editor/OptionsBar'
import { RightSidebar } from '@/components/image-editor/RightSidebar'
import { StatusBar } from '@/components/image-editor/StatusBar'
import { ToolsPalette } from '@/components/image-editor/ToolsPalette'
import { STUB_TOOLS } from '@/components/image-editor/tool-meta'
import { Workspace, type WorkspaceHandle } from '@/components/image-editor/Workspace'
import '@/components/image-editor/pixelforge.css'
import { initialState, PREVIEW_MAX } from '@/lib/image-editor/defaults'
import { floodFillMask, maskToDataUrl } from '@/lib/image-editor/flood-fill'
import { useHistoryState } from '@/lib/image-editor/history'
import { fileToDataUrl, useImageCache } from '@/lib/image-editor/image-cache'
import { dimsAfterRotation, renderTo } from '@/lib/image-editor/render'
import { translateLayer } from '@/lib/image-editor/transform'
import {
  loadImageFromUrl,
  parseProject,
  serializeProject,
} from '@/lib/image-editor/serialize'
import type {
  AnnotationLayer,
  EditorState,
  Layer,
  OutputFormat,
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
  const [bucketTolerance, setBucketTolerance] = useState(32)
  const [wandTolerance, setWandTolerance] = useState(32)
  const [selectedLayerId, setSelectedLayerId] = useState<string>('image')

  const [outFormat, setOutFormat] = useState<OutputFormat>('png')
  const outQuality = 92

  const [focused, setFocused] = useState(false)
  const canvasRef = useRef<CanvasHandle | null>(null)
  const workspaceRef = useRef<WorkspaceHandle | null>(null)

  const { cache: imageCache, ensure: ensureImage } = useImageCache()

  const duplicateRef = useRef<() => void>(() => {})
  const moveLayerRef = useRef<(d: 'forward' | 'backward' | 'front' | 'back') => void>(() => {})
  const deleteLayerRef = useRef<() => void>(() => {})

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
        if (e.key === '0') { e.preventDefault(); zoomReset(); return }
        if (e.key === '1') { e.preventDefault(); setZoom(1); setPan({ x: 0, y: 0 }); return }
        if (e.key === 'j' || e.key === 'J') { e.preventDefault(); duplicateRef.current(); return }
        if (e.key === ']') { e.preventDefault(); moveLayerRef.current(e.shiftKey ? 'front' : 'forward'); return }
        if (e.key === '[') { e.preventDefault(); moveLayerRef.current(e.shiftKey ? 'back' : 'backward'); return }
        // Cmd+D = deselect, Cmd+A = select all (PS conventions). Both no-op
        // when there's no image yet.
        if (e.key === 'd' || e.key === 'D') {
          e.preventDefault()
          history.set({ ...state, selection: undefined, selectionPath: undefined })
          return
        }
        if (e.key === 'a' || e.key === 'A') {
          e.preventDefault()
          if (image) {
            const { baseW, baseH } = dimsAfterRotation(image, state)
            const previewScale = Math.min(1, PREVIEW_MAX / Math.max(baseW, baseH, 1))
            history.set({
              ...state,
              selection: { x: 0, y: 0, w: baseW * previewScale, h: baseH * previewScale },
              selectionPath: undefined,
            })
          }
          return
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
  }, [focused, zoomIn, zoomOut, zoomReset, swapColors, resetColors, selectedLayerId, trySetTool, history, state, image])

  // ── Layer state helpers ──────────────────────────────────────────────────
  const setLayers = useCallback(
    (layers: Layer[]) => history.set({ ...state, layers }),
    [history, state],
  )
  const commitLayer = useCallback(
    (layer: Layer) => {
      history.set({ ...state, layers: [...state.layers, layer] })
      setSelectedLayerId(layer.id)
    },
    [history, state],
  )
  const patchLayer = useCallback(
    (id: string, patch: Partial<Layer>) =>
      history.set({
        ...state,
        layers: state.layers.map((l) =>
          l.id === id ? ({ ...l, ...patch } as Layer) : l,
        ),
      }),
    [history, state],
  )
  const deleteLayer = useCallback(
    (id: string) => history.set({ ...state, layers: state.layers.filter((l) => l.id !== id) }),
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
        layers: state.layers.map((l) => (l.id === id ? layer : l)),
      }),
    [history, state],
  )

  useEffect(() => {
    duplicateRef.current = () => {
      const orig = state.layers.find((l) => l.id === selectedLayerId)
      if (!orig) return
      const copy = JSON.parse(JSON.stringify(orig)) as Layer
      copy.id = crypto.randomUUID()
      copy.name = `${orig.name} copy`
      const shifted = translateLayer(copy, 10, 10)
      const idx = state.layers.findIndex((l) => l.id === selectedLayerId)
      const next = [...state.layers]
      next.splice(idx + 1, 0, shifted)
      history.set({ ...state, layers: next })
      setSelectedLayerId(shifted.id)
    }
    moveLayerRef.current = (direction) => {
      const idx = state.layers.findIndex((l) => l.id === selectedLayerId)
      if (idx === -1) return
      const next = [...state.layers]
      const [layer] = next.splice(idx, 1)
      let newIdx: number
      if (direction === 'forward') newIdx = Math.min(next.length, idx + 1)
      else if (direction === 'backward') newIdx = Math.max(0, idx - 1)
      else if (direction === 'front') newIdx = next.length
      else newIdx = 0
      if (newIdx === idx) return
      next.splice(newIdx, 0, layer)
      history.set({ ...state, layers: next })
    }
    deleteLayerRef.current = () => {
      if (!selectedLayerId || selectedLayerId === 'image') return
      history.set({
        ...state,
        layers: state.layers.filter((l) => l.id !== selectedLayerId),
      })
      setSelectedLayerId('image')
    }
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
    [history, t],
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
            duplicateLayer: () => duplicateRef.current(),
            deleteLayer: () => deleteLayerRef.current(),
            zoomIn,
            zoomOut,
            zoomFit: zoomReset,
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
