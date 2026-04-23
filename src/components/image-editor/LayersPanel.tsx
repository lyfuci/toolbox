import { useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, GripVertical, Image as ImageIcon, Layers, X } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Slider } from './Slider'
import { BLEND_MODES, type BlendMode, type EditorState, type Layer } from '@/lib/image-editor/types'

type Props = {
  state: EditorState
  /** Replace the full layers list (used by reorder + bulk operations). */
  setLayers: (layers: Layer[]) => void
  /** Patch a layer's properties (visibility / opacity / blend / name). */
  patchLayer: (id: string, patch: Partial<Layer>) => void
  patchImageLayer: (patch: Partial<EditorState['imageLayer']>) => void
  deleteLayer: (id: string) => void
}

export function LayersPanel({
  state,
  setLayers,
  patchLayer,
  patchImageLayer,
  deleteLayer,
}: Props) {
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState<string>('image')
  const [dragId, setDragId] = useState<string | null>(null)

  // Display layers from top→bottom (visually intuitive); image is always at the
  // bottom of the stack so we render it last in the list.
  const ordered = [...state.layers].reverse()
  const selectedLayer: Layer | EditorState['imageLayer'] | undefined =
    selectedId === 'image'
      ? state.imageLayer
      : state.layers.find((l) => l.id === selectedId)

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const ids = state.layers.map((l) => l.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    if (from === -1 || to === -1) return
    const next = [...state.layers]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setLayers(next)
    setDragId(null)
  }

  return (
    <div className="rounded-lg border border-border bg-card/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground/70">
          <Layers className="h-3.5 w-3.5" />
          {t('pages.imageEditor.layers')}
        </Label>
        <span className="text-xs text-muted-foreground">{state.layers.length + 1}</span>
      </div>

      <ul className="flex flex-col gap-1">
        {ordered.map((layer, i) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            index={state.layers.length - i}
            selected={selectedId === layer.id}
            onSelect={() => setSelectedId(layer.id)}
            onToggle={() => patchLayer(layer.id, { visible: !layer.visible })}
            onDelete={() => {
              deleteLayer(layer.id)
              if (selectedId === layer.id) setSelectedId('image')
            }}
            onDragStart={() => setDragId(layer.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(layer.id)}
          />
        ))}
        {/* Image background — always layer #0, can't be reordered or deleted. */}
        <li
          onClick={() => setSelectedId('image')}
          className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-xs ${
            selectedId === 'image'
              ? 'border-primary bg-accent/40'
              : 'border-border/60 bg-background/40 hover:bg-accent/20'
          }`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              patchImageLayer({ visible: !state.imageLayer.visible })
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            {state.imageLayer.visible ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
          </button>
          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="flex-1 truncate">{t('pages.imageEditor.layerImage')}</span>
          <span className="font-mono text-muted-foreground">#0</span>
        </li>
      </ul>

      {/* Properties panel for the currently selected layer. */}
      {selectedLayer ? (
        <div className="mt-3 border-t border-border pt-3">
          <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground/70">
            {t('pages.imageEditor.layerProps')}
          </Label>
          <Slider
            label={t('pages.imageEditor.opacity')}
            value={selectedLayer.opacity}
            min={0}
            max={100}
            unit="%"
            onChange={(v) =>
              selectedId === 'image'
                ? patchImageLayer({ opacity: v })
                : patchLayer(selectedId, { opacity: v })
            }
          />
          <div className="mt-2 flex items-center gap-2">
            <Label className="w-16 text-xs text-muted-foreground">
              {t('pages.imageEditor.blend')}
            </Label>
            <select
              value={selectedLayer.blend}
              onChange={(e) => {
                const b = e.target.value as BlendMode
                if (selectedId === 'image') patchImageLayer({ blend: b })
                else patchLayer(selectedId, { blend: b })
              }}
              className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              {BLEND_MODES.map((b) => (
                <option key={b} value={b} className="bg-background text-foreground">
                  {t(`pages.imageEditor.blendMode.${b}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function LayerRow({
  layer,
  index,
  selected,
  onSelect,
  onToggle,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  layer: Layer
  index: number
  selected: boolean
  onSelect: () => void
  onToggle: () => void
  onDelete: () => void
  onDragStart: (e: DragEvent<HTMLLIElement>) => void
  onDragOver: (e: DragEvent<HTMLLIElement>) => void
  onDrop: (e: DragEvent<HTMLLIElement>) => void
}) {
  const { t } = useTranslation()
  const labelKey = layerLabelKey(layer)
  const labelArgs = layer.kind === 'annotation' && layer.shape.kind === 'text'
    ? { text: layer.shape.text.length > 20 ? layer.shape.text.slice(0, 20) + '…' : layer.shape.text }
    : undefined
  const labelText = t(labelKey, labelArgs)
  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onSelect}
      className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-xs ${
        selected
          ? 'border-primary bg-accent/40'
          : 'border-border/60 bg-background/40 hover:bg-accent/20'
      }`}
    >
      <GripVertical className="h-3 w-3 cursor-grab text-muted-foreground/50" />
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        className="text-muted-foreground hover:text-foreground"
      >
        {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
      <span className="flex-1 truncate">{labelText}</span>
      <span className="font-mono text-muted-foreground">#{index}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="text-muted-foreground hover:text-destructive"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}

function layerLabelKey(layer: Layer): string {
  if (layer.kind === 'mask') return 'pages.imageEditor.annoLabel.mask'
  switch (layer.shape.kind) {
    case 'rect':
      return 'pages.imageEditor.annoLabel.rect'
    case 'arrow':
      return 'pages.imageEditor.annoLabel.arrow'
    case 'text':
      return 'pages.imageEditor.annoLabel.text'
    case 'mosaic':
      return 'pages.imageEditor.annoLabel.mosaic'
    case 'brush':
      return layer.shape.eraser
        ? 'pages.imageEditor.annoLabel.eraser'
        : 'pages.imageEditor.annoLabel.brush'
  }
}
