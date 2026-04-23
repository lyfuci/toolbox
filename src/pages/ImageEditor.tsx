import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Canvas, type CanvasHandle } from '@/components/image-editor/Canvas'
import { DropZone } from '@/components/image-editor/DropZone'
import { RightSidebar } from '@/components/image-editor/RightSidebar'
import { ToolsPalette } from '@/components/image-editor/ToolsPalette'
import { TopActionBar } from '@/components/image-editor/TopActionBar'
import { Workspace } from '@/components/image-editor/Workspace'
import { initialState } from '@/lib/image-editor/defaults'
import { useHistoryState } from '@/lib/image-editor/history'
import {
  loadImageFromUrl,
  parseProject,
  serializeProject,
} from '@/lib/image-editor/serialize'
import type {
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
  const [color, setColor] = useState('#ef4444')
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [selectedLayerId, setSelectedLayerId] = useState<string>('image')

  const [outFormat, setOutFormat] = useState<OutputFormat>('png')
  const [outQuality, setOutQuality] = useState(92)

  // Focus mode: editor takes over the viewport, hides toolbox chrome.
  const [focused, setFocused] = useState(false)
  const canvasRef = useRef<CanvasHandle | null>(null)

  // ── Keyboard: F to toggle focus, Esc to exit ─────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't steal keys typed into form fields.
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        setFocused((v) => !v)
      } else if (e.key === 'Escape' && focused) {
        e.preventDefault()
        setFocused(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focused])

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
          color={color}
          setColor={setColor}
          strokeWidth={strokeWidth}
          setStrokeWidth={setStrokeWidth}
        />

        <Workspace>
          <Canvas
            ref={canvasRef}
            image={image}
            state={state}
            tool={tool}
            toolColor={color}
            toolStrokeWidth={strokeWidth}
            selectedId={selectedLayerId}
            onSelect={setSelectedLayerId}
            onCommitLayer={commitLayer}
            onCommitLayerUpdate={commitLayerUpdate}
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
