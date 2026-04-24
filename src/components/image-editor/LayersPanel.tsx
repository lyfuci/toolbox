import { type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, GripVertical, Image as ImageIcon, X } from 'lucide-react'
import type { EditorState, Layer } from '@/lib/image-editor/types'

type Props = {
  state: EditorState
  selectedId: string
  onSelect: (id: string) => void
  setLayers: (layers: Layer[]) => void
  patchLayer: (id: string, patch: Partial<Layer>) => void
  patchImageLayer: (patch: Partial<EditorState['imageLayer']>) => void
  deleteLayer: (id: string) => void
}

/**
 * The layer list (PS-style). Top→bottom by stacking order (last in
 * state.layers = on top). The image background is a fixed, non-reorderable
 * row at the bottom. Drag-to-reorder works on user layers; image is pinned.
 *
 * Per-layer properties (opacity / blend) are NOT here — see PropertiesPanel.
 */
export function LayersPanel({
  state,
  selectedId,
  onSelect,
  setLayers,
  patchLayer,
  patchImageLayer,
  deleteLayer,
}: Props) {
  const { t } = useTranslation()
  const ordered = [...state.layers].reverse()

  const handleDrop = (dragId: string | null, targetId: string) => {
    if (!dragId || dragId === targetId) return
    const ids = state.layers.map((l) => l.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    if (from === -1 || to === -1) return
    const next = [...state.layers]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setLayers(next)
  }

  return (
    <ul className="flex flex-col gap-1">
      {ordered.map((layer, i) => (
        <LayerRow
          key={layer.id}
          layer={layer}
          index={state.layers.length - i}
          selected={selectedId === layer.id}
          onSelect={() => onSelect(layer.id)}
          onToggle={() => patchLayer(layer.id, { visible: !layer.visible })}
          onDelete={() => {
            deleteLayer(layer.id)
            if (selectedId === layer.id) onSelect('image')
          }}
          onDrop={(dragId) => handleDrop(dragId, layer.id)}
        />
      ))}
      {/* Pinned image row */}
      <li
        onClick={() => onSelect('image')}
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
  )
}

function LayerRow({
  layer,
  index,
  selected,
  onSelect,
  onToggle,
  onDelete,
  onDrop,
}: {
  layer: Layer
  index: number
  selected: boolean
  onSelect: () => void
  onToggle: () => void
  onDelete: () => void
  onDrop: (dragId: string | null) => void
}) {
  const { t } = useTranslation()
  const labelKey = layerLabelKey(layer)
  const labelArgs =
    layer.kind === 'annotation' && layer.shape.kind === 'text'
      ? {
          text:
            layer.shape.text.length > 20
              ? layer.shape.text.slice(0, 20) + '…'
              : layer.shape.text,
        }
      : undefined
  return (
    <li
      draggable
      onDragStart={(e: DragEvent<HTMLLIElement>) =>
        e.dataTransfer.setData('text/plain', layer.id)
      }
      onDragOver={(e: DragEvent<HTMLLIElement>) => e.preventDefault()}
      onDrop={(e: DragEvent<HTMLLIElement>) =>
        onDrop(e.dataTransfer.getData('text/plain') || null)
      }
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
      <span className="flex-1 truncate">{t(labelKey, labelArgs)}</span>
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
    case 'image':
      return 'pages.imageEditor.annoLabel.image'
    case 'ellipse':
      return 'pages.imageEditor.annoLabel.ellipse'
    case 'line':
      return 'pages.imageEditor.annoLabel.line'
    case 'blur':
      return 'pages.imageEditor.annoLabel.blur'
  }
}
