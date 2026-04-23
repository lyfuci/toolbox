import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Canvas, type CanvasHandle } from '@/components/image-editor/Canvas'
import { DropZone } from '@/components/image-editor/DropZone'
import { RightSidebar } from '@/components/image-editor/RightSidebar'
import { StatusBar } from '@/components/image-editor/StatusBar'
import { ToolsPalette } from '@/components/image-editor/ToolsPalette'
import { TopActionBar } from '@/components/image-editor/TopActionBar'
import { Workspace, type WorkspaceHandle } from '@/components/image-editor/Workspace'
import { initialState } from '@/lib/image-editor/defaults'
import { useHistoryState } from '@/lib/image-editor/history'
import { fileToDataUrl, useImageCache } from '@/lib/image-editor/image-cache'
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
  Tool,
} from '@/lib/image-editor/types'

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
  const [selectedLayerId, setSelectedLayerId] = useState<string>('image')

  const [outFormat, setOutFormat] = useState<OutputFormat>('png')
  const [outQuality, setOutQuality] = useState(92)

  // Focus mode: editor takes over the viewport, hides toolbox chrome.
  const [focused, setFocused] = useState(false)
  const canvasRef = useRef<CanvasHandle | null>(null)
  const workspaceRef = useRef<WorkspaceHandle | null>(null)

  // Cache of HTMLImageElements for image-shape layers (drag-drop'd images).
  const { cache: imageCache, ensure: ensureImage } = useImageCache()

  // Zoom + pan + Space-held pan mode.
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [panMode, setPanMode] = useState(false)

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

  /**
   * Zoom by `factor` so the point under the cursor stays fixed on screen.
   * Used by both the Z (zoom) tool click and Cmd/Ctrl+wheel.
   *
   * Math: the wrapper is rendered with `translate(pan) scale(zoom)` around its
   * geometric centre. To keep the cursor anchored when zoom changes from z₀ to
   * z₁, the new pan must satisfy:
   *   panNew = pan + (cursor - wrapperCentre) * (1 - z₁/z₀)
   */
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

  // ── Global keyboard shortcuts ────────────────────────────────────────────
  // F = focus toggle / Esc exit (existing).
  // Space-hold = pan tool override.
  // Z / Shift+Z / Cmd+/-/0/1 = zoom.
  // V / M / T / B / E / A = tool shortcuts (PS conventions).
  // (Cmd+Z / Cmd+Shift+Z handled in useHistoryState.)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      // Space → pan mode (no modifiers).
      if (e.code === 'Space' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        setPanMode(true)
        return
      }

      // Cmd/Ctrl combos.
      const mod = e.metaKey || e.ctrlKey
      if (mod) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault()
          zoomIn()
          return
        }
        if (e.key === '-' || e.key === '_') {
          e.preventDefault()
          zoomOut()
          return
        }
        if (e.key === '0') {
          e.preventDefault()
          zoomReset()
          return
        }
        if (e.key === '1') {
          e.preventDefault()
          setZoom(1)
          setPan({ x: 0, y: 0 })
          return
        }
        return
      }

      // No-modifier letter shortcuts.
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        setFocused((v) => !v)
        return
      }
      if (e.key === 'Escape' && focused) {
        e.preventDefault()
        setFocused(false)
        return
      }
      // X = swap fg/bg. D = default colors (black/white). PS conventions.
      if (e.key === 'x' || e.key === 'X') {
        e.preventDefault()
        swapColors()
        return
      }
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        resetColors()
        return
      }
      // Tool shortcuts (PS-style). Z is the zoom *tool* (click to zoom in,
      // Alt+click to zoom out) — not a one-shot zoom action.
      if (e.key === 'v') { e.preventDefault(); setTool('none'); return }
      if (e.key === 'm') { e.preventDefault(); setTool('rect'); return }
      if (e.key === 'a') { e.preventDefault(); setTool('arrow'); return }
      if (e.key === 't') { e.preventDefault(); setTool('text'); return }
      if (e.key === 'b') { e.preventDefault(); setTool('brush'); return }
      if (e.key === 'e') { e.preventDefault(); setTool('eraser'); return }
      if (e.key === 'i') { e.preventDefault(); setTool('eyedropper'); return }
      if (e.key === 'z') { e.preventDefault(); setTool('zoom'); return }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setPanMode(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [focused, zoomIn, zoomOut, zoomReset, swapColors, resetColors])

  // ── State helpers ────────────────────────────────────────────────────────
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
  // Replace a layer's full data — used by Canvas after a move/resize commits.
  const commitLayerUpdate = useCallback(
    (id: string, layer: Layer) =>
      history.set({
        ...state,
        layers: state.layers.map((l) => (l.id === id ? layer : l)),
      }),
    [history, state],
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

  // Hidden replace-image input triggered from the top action bar.
  const replaceInputRef = useRef<HTMLInputElement | null>(null)

  // Drop an image file onto the workspace → add as a new image-shape layer
  // centred on the canvas, sized to fit half the shorter canvas dimension.
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
        // Place into preview-pixel space — same coord system shapes use.
        const previewMax = Math.min(
          image.naturalWidth,
          image.naturalHeight,
        ) / 2
        const ratio = img.naturalWidth / img.naturalHeight
        const w = previewMax
        const h = previewMax / ratio
        const x = image.naturalWidth / 2 - w / 2
        const y = image.naturalHeight / 2 - h / 2
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
    [ensureImage, image, commitLayer, t],
  )

  const handlePickColor = useCallback(
    (hex: string) => setColors((c) => ({ ...c, fg: hex })),
    [],
  )

  // ── Download ─────────────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!image || !canvasRef.current) return
    const exportCanvas = document.createElement('canvas')
    canvasRef.current.exportTo(exportCanvas)
    const mime =
      outFormat === 'png' ? 'image/png' : outFormat === 'jpeg' ? 'image/jpeg' : 'image/webp'
    const ext = outFormat === 'jpeg' ? 'jpg' : outFormat
    const quality = outFormat === 'png' ? undefined : outQuality / 100
    const blob: Blob | null = await new Promise((resolve) =>
      exportCanvas.toBlob((b) => resolve(b), mime, quality),
    )
    if (!blob) {
      toast.error(t('pages.imageEditor.errExport'))
      return
    }
    triggerDownload(blob, `${filename}_edited.${ext}`)
    toast.success(t('pages.imageEditor.downloaded', { format: outFormat.toUpperCase() }))
  }

  const handleSaveProject = () => {
    if (!image) return
    const blob = serializeProject({ image, filename, state })
    triggerDownload(blob, `${filename}.toolbox-image.json`)
    toast.success(t('pages.imageEditor.projectSaved'))
  }

  // ── Render ───────────────────────────────────────────────────────────────
  // Focus mode: position:fixed over the entire viewport, hides toolbox chrome.
  // Embedded mode: lives inside <main>, fills available height (the toolbox
  // topbar is 3.5rem tall, so we subtract that to get a clean viewport fit).
  const rootClass = focused
    ? 'fixed inset-0 z-50 flex h-svh flex-col bg-background'
    : 'flex h-[calc(100svh-3.5rem)] flex-col'

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

  return (
    <div className={rootClass}>
      <TopActionBar
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        format={outFormat}
        setFormat={setOutFormat}
        quality={outQuality}
        setQuality={setOutQuality}
        onDownload={handleDownload}
        onSaveProject={handleSaveProject}
        onLoadProject={acceptFile}
        onReplaceImage={() => replaceInputRef.current?.click()}
        focused={focused}
        toggleFocus={() => setFocused((v) => !v)}
      />

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

      <div className="flex flex-1 overflow-hidden">
        <ToolsPalette
          tool={tool}
          setTool={setTool}
          fgColor={colors.fg}
          bgColor={colors.bg}
          setFgColor={(c) => setColors((s) => ({ ...s, fg: c }))}
          setBgColor={(c) => setColors((s) => ({ ...s, bg: c }))}
          swapColors={swapColors}
          resetColors={resetColors}
          strokeWidth={strokeWidth}
          setStrokeWidth={setStrokeWidth}
        />

        <Workspace
          ref={workspaceRef}
          zoom={zoom}
          pan={pan}
          setPan={setPan}
          panMode={panMode}
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
            panMode={panMode}
            imageCache={imageCache}
            onZoomAt={zoomAtPoint}
            onPickColor={handlePickColor}
          />
        </Workspace>

        <RightSidebar
          state={state}
          selectedId={selectedLayerId}
          onSelect={setSelectedLayerId}
          setLayers={setLayers}
          patchLayer={patchLayer}
          patchImageLayer={patchImageLayer}
          deleteLayer={deleteLayer}
          setTransforms={(transforms) => history.set({ ...state, transforms })}
          setAdjust={(adjust) => history.set({ ...state, adjust })}
        />
      </div>

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
