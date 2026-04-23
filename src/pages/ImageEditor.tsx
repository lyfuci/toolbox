import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Redo2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdjustPanel } from '@/components/image-editor/AdjustPanel'
import { AnnotatePanel } from '@/components/image-editor/AnnotatePanel'
import { Canvas, type CanvasHandle } from '@/components/image-editor/Canvas'
import { DropZone } from '@/components/image-editor/DropZone'
import { FullscreenToggle } from '@/components/image-editor/FullscreenToggle'
import { LayersPanel } from '@/components/image-editor/LayersPanel'
import { OutputPanel } from '@/components/image-editor/OutputPanel'
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

  const [outFormat, setOutFormat] = useState<OutputFormat>('png')
  const [outQuality, setOutQuality] = useState(92)

  const [fullscreen, setFullscreen] = useState(false)
  const canvasRef = useRef<CanvasHandle | null>(null)

  // ── State helpers (all go through history) ────────────────────────────────
  const setLayers = useCallback(
    (layers: Layer[]) => history.set({ ...state, layers }),
    [history, state],
  )
  const commitLayer = useCallback(
    (layer: Layer) => history.set({ ...state, layers: [...state.layers, layer] }),
    [history, state],
  )
  const patchLayer = useCallback(
    (id: string, patch: Partial<Layer>) =>
      history.set({
        ...state,
        layers: state.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)),
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

  // ── File handling ─────────────────────────────────────────────────────────
  const acceptFile = useCallback(
    async (file: File) => {
      // Project file: restore full editor state.
      if (file.type === 'application/json' || /\.json$/i.test(file.name)) {
        try {
          const text = await file.text()
          const project = parseProject(text)
          const img = await loadImageFromUrl(project.source.dataUrl)
          setImage(img)
          setFilename(project.source.name.replace(/\.[^./]+$/, ''))
          history.reset(project.state)
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
      } catch {
        toast.error(t('pages.imageEditor.errLoadFailed'))
      } finally {
        URL.revokeObjectURL(url)
      }
    },
    [history, t],
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
  const containerClass = fullscreen
    ? 'fixed inset-0 z-50 overflow-auto bg-background px-6 py-6'
    : 'mx-auto max-w-7xl px-8 py-12'

  return (
    <div className={containerClass}>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('tools.image-editor.name')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('pages.imageEditor.description')}
          </p>
        </div>
        {image && (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={!history.canUndo}
              onClick={history.undo}
              title="Cmd/Ctrl+Z"
            >
              <Undo2 className="h-4 w-4" />
              {t('pages.imageEditor.undo')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!history.canRedo}
              onClick={history.redo}
              title="Cmd/Ctrl+Shift+Z"
            >
              <Redo2 className="h-4 w-4" />
              {t('pages.imageEditor.redo')}
            </Button>
            <FullscreenToggle
              isFullscreen={fullscreen}
              onToggle={() => setFullscreen((v) => !v)}
            />
          </div>
        )}
      </header>

      {!image ? (
        <DropZone onFile={acceptFile} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          {/* LEFT: canvas + layers panel */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {image.naturalWidth} × {image.naturalHeight}px ·{' '}
                <button
                  onClick={() => {
                    setImage(null)
                    history.reset(initialState())
                  }}
                  className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                >
                  {t('pages.imageEditor.replaceImage')}
                </button>
              </span>
              {tool !== 'none' && (
                <span className="text-amber-500">
                  {t('pages.imageEditor.toolHint', {
                    tool: t(`pages.imageEditor.tool.${tool}`),
                  })}
                </span>
              )}
            </div>
            <div className="flex justify-center overflow-auto rounded-lg border border-border bg-card/30 p-3">
              <Canvas
                ref={canvasRef}
                image={image}
                state={state}
                tool={tool}
                toolColor={color}
                toolStrokeWidth={strokeWidth}
                onCommitLayer={commitLayer}
              />
            </div>
            <LayersPanel
              state={state}
              setLayers={setLayers}
              patchLayer={patchLayer}
              patchImageLayer={patchImageLayer}
              deleteLayer={deleteLayer}
            />
          </div>

          {/* RIGHT: control tabs */}
          <div>
            <Tabs defaultValue="adjust">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="adjust">{t('pages.imageEditor.tabAdjust')}</TabsTrigger>
                <TabsTrigger value="annotate">{t('pages.imageEditor.tabAnnotate')}</TabsTrigger>
                <TabsTrigger value="output">{t('pages.imageEditor.tabOutput')}</TabsTrigger>
              </TabsList>

              <TabsContent value="adjust" className="mt-4">
                <AdjustPanel
                  transforms={state.transforms}
                  setTransforms={(transforms) => history.set({ ...state, transforms })}
                  adjust={state.adjust}
                  setAdjust={(adjust) => history.set({ ...state, adjust })}
                />
              </TabsContent>

              <TabsContent value="annotate" className="mt-4">
                <AnnotatePanel
                  tool={tool}
                  setTool={setTool}
                  color={color}
                  setColor={setColor}
                  strokeWidth={strokeWidth}
                  setStrokeWidth={setStrokeWidth}
                />
              </TabsContent>

              <TabsContent value="output" className="mt-4">
                <OutputPanel
                  format={outFormat}
                  setFormat={setOutFormat}
                  quality={outQuality}
                  setQuality={setOutQuality}
                  onDownload={handleDownload}
                  onSaveProject={handleSaveProject}
                  onLoadProject={acceptFile}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
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
