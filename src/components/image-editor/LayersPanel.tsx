import { type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  GripVertical,
  Image as ImageIcon,
  X,
} from 'lucide-react'
import {
  findLayerById,
  findLayerPath,
  insertAtPath,
  isGroup,
  parentPathOf,
  removeAtPath,
} from '@/lib/image-editor/layer-tree'
import { hasEffects } from '@/lib/image-editor/layer-effects'
import type { EditorState, GroupLayer, Layer } from '@/lib/image-editor/types'

type Props = {
  state: EditorState
  selectedId: string
  onSelect: (id: string) => void
  setLayers: (layers: Layer[]) => void
  patchLayer: (id: string, patch: Partial<Layer>) => void
  patchImageLayer: (patch: Partial<EditorState['imageLayer']>) => void
  deleteLayer: (id: string) => void
  /** Open the Layer Style dialog for `id`. Triggered by the fx badge on a row. */
  onOpenStyle: (id: string) => void
  /** Right-click on a layer row. Caller opens a ContextMenu at (x, y). */
  onLayerContextMenu?: (id: string, x: number, y: number) => void
}

type DropMode = 'into' | 'sibling' | 'top'

/**
 * The layer list (PS-style). Top→bottom by stacking order (last in
 * state.layers = on top). The image background is a fixed, non-reorderable
 * row at the bottom. Drag-to-reorder works on user layers; image is pinned.
 *
 * Groups display as a folder row with a disclosure chevron; expanded groups
 * render their children indented below. Dropping a row onto another layer
 * reorders it to that layer's position within the same parent; dropping onto
 * a group's folder area moves the dragged layer to the top of that group's
 * children. Dropping onto the trailing "outside" zone moves the dragged
 * layer to the top-level (out of any enclosing group).
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
  onOpenStyle,
  onLayerContextMenu,
}: Props) {
  const { t } = useTranslation()

  /**
   * Move `dragId` to a new location. `mode`:
   *  - 'into'    : drop into the target group (at the top of its children)
   *  - 'sibling' : reorder so the dragged layer takes target's slot in
   *                target's parent (target shifts down a step)
   *  - 'top'     : promote to top-level (last position in state.layers).
   *                `targetId` is ignored.
   *
   * Refuses to drop a group onto itself or a descendant — that would orphan
   * the dragged subtree.
   */
  const moveLayer = (dragId: string, targetId: string | null, mode: DropMode) => {
    if (!dragId || dragId === targetId) return
    if (targetId && isAncestorOf(state.layers, dragId, targetId)) return

    const dragPath = findLayerPath(state.layers, dragId)
    if (!dragPath) return
    const { tree: afterRemove, removed } = removeAtPath(state.layers, dragPath)
    if (!removed) return

    let insertPath: number[]
    if (mode === 'top' || !targetId) {
      // Top of stack = end of top-level list (panel renders reversed).
      insertPath = [afterRemove.length]
    } else if (mode === 'into') {
      const group = findLayerById(afterRemove, targetId)
      if (!group || !isGroup(group)) return
      const groupPath = findLayerPath(afterRemove, targetId)
      if (!groupPath) return
      // Insert at end of children → on top of the group (panel renders reversed).
      insertPath = [...groupPath, group.children.length]
    } else {
      // Sibling insertion at target's slot. Resolve the path post-removal so
      // when dragging downwards within the same parent the index is right.
      const targetPath = findLayerPath(afterRemove, targetId)
      if (!targetPath) return
      insertPath = targetPath
    }
    setLayers(insertAtPath(afterRemove, insertPath, removed))
  }

  const handleToggleExpanded = (id: string) => {
    const layer = findLayerById(state.layers, id)
    if (!layer || !isGroup(layer)) return
    patchLayer(id, { expanded: !layer.expanded })
  }

  const handleToggleVisible = (id: string) => {
    const l = findLayerById(state.layers, id)
    if (!l) return
    patchLayer(id, { visible: !l.visible })
  }

  const handleDelete = (id: string) => {
    deleteLayer(id)
    if (selectedId === id) onSelect('image')
  }

  /**
   * Display index shown in the trailing #N badge. The image background is #0;
   * top-level layers count bottom→top starting at #1. Children of groups
   * share the group's display index — distinguishing them by sub-index would
   * just be noise in a panel that already conveys depth via indentation.
   */
  const indexFor = (id: string): number => {
    const path = findLayerPath(state.layers, id)
    if (!path) return 0
    return path[0] + 1
  }

  return (
    <ul className="flex flex-col gap-1">
      {[...state.layers].reverse().map((layer) => (
        <LayerSubtree
          key={layer.id}
          layer={layer}
          depth={0}
          selectedId={selectedId}
          indexFor={indexFor}
          onSelect={onSelect}
          onToggleVisible={handleToggleVisible}
          onToggleExpanded={handleToggleExpanded}
          onDelete={handleDelete}
          onDrop={(dragId, targetId, mode) => moveLayer(dragId, targetId, mode)}
          onOpenStyle={onOpenStyle}
          onLayerContextMenu={onLayerContextMenu}
        />
      ))}

      {/* Outside zone: drop here to move out of any group → top-level. Sits
          just above the pinned image row so it reads as "below all user
          layers" — i.e., the bottom of the user-layer stack. */}
      <li
        className="rounded border border-dashed border-border/30 px-2 py-1 text-[10px] text-muted-foreground/60"
        onDragOver={(e: DragEvent<HTMLLIElement>) => e.preventDefault()}
        onDrop={(e: DragEvent<HTMLLIElement>) => {
          const id = e.dataTransfer.getData('text/plain')
          if (!id) return
          const parent = parentPathOf(state.layers, id)
          if (!parent || parent.parentPath.length === 0) return
          moveLayer(id, null, 'top')
        }}
      >
        {t('pages.imageEditor.layers.dropOutside')}
      </li>

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

/**
 * Recursive subtree renderer — one row for `layer`, plus children rows
 * (indented) when `layer` is an expanded group. Each row drops directly into
 * `onDrop` with its own id as the target; the parent's `moveLayer` is what
 * actually mutates state.
 */
function LayerSubtree({
  layer,
  depth,
  selectedId,
  indexFor,
  onSelect,
  onToggleVisible,
  onToggleExpanded,
  onDelete,
  onDrop,
  onOpenStyle,
  onLayerContextMenu,
}: {
  layer: Layer
  depth: number
  selectedId: string
  indexFor: (id: string) => number
  onSelect: (id: string) => void
  onToggleVisible: (id: string) => void
  onToggleExpanded: (id: string) => void
  onDelete: (id: string) => void
  onDrop: (dragId: string, targetId: string, mode: 'into' | 'sibling') => void
  onOpenStyle: (id: string) => void
  onLayerContextMenu?: (id: string, x: number, y: number) => void
}) {
  const group = isGroup(layer) ? layer : null
  return (
    <>
      <LayerRow
        layer={layer}
        depth={depth}
        selected={selectedId === layer.id}
        index={indexFor(layer.id)}
        isGroupRow={!!group}
        groupExpanded={!!group?.expanded}
        onSelect={() => onSelect(layer.id)}
        onToggleVisible={() => onToggleVisible(layer.id)}
        onToggleExpanded={() => onToggleExpanded(layer.id)}
        onDelete={() => onDelete(layer.id)}
        onDrop={(dragId, mode) => onDrop(dragId, layer.id, mode)}
        onOpenStyle={() => onOpenStyle(layer.id)}
        onContextMenu={(x, y) => onLayerContextMenu?.(layer.id, x, y)}
      />
      {group && group.expanded &&
        [...group.children].reverse().map((c) => (
          <LayerSubtree
            key={c.id}
            layer={c}
            depth={depth + 1}
            selectedId={selectedId}
            indexFor={indexFor}
            onSelect={onSelect}
            onToggleVisible={onToggleVisible}
            onToggleExpanded={onToggleExpanded}
            onDelete={onDelete}
            onDrop={onDrop}
            onOpenStyle={onOpenStyle}
            onLayerContextMenu={onLayerContextMenu}
          />
        ))}
    </>
  )
}

/**
 * A single row in the layers panel. Knows its own depth (for indentation) and
 * whether it's a group (to render the chevron + folder icon + drop-into zone).
 *
 * Drag/drop split: the folder icon area on a group row is a "drop-into"
 * target (mode='into'); the rest of the row is a sibling-insert target
 * (mode='sibling'). The bigger sibling zone matches PS's default — dropping
 * on a layer puts the dragged layer alongside it, not inside it.
 */
function LayerRow({
  layer,
  depth,
  selected,
  index,
  isGroupRow,
  groupExpanded,
  onSelect,
  onToggleVisible,
  onToggleExpanded,
  onDelete,
  onDrop,
  onOpenStyle,
  onContextMenu,
}: {
  layer: Layer
  depth: number
  selected: boolean
  index: number
  isGroupRow: boolean
  groupExpanded: boolean
  onSelect: () => void
  onToggleVisible: () => void
  onToggleExpanded: () => void
  onDelete: () => void
  onDrop: (dragId: string, mode: 'into' | 'sibling') => void
  onOpenStyle: () => void
  onContextMenu?: (x: number, y: number) => void
}) {
  const { t } = useTranslation()
  const showFx = hasEffects(layer)
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
  const padLeft = 4 + depth * 12
  return (
    <li
      draggable
      onDragStart={(e: DragEvent<HTMLLIElement>) => {
        e.dataTransfer.setData('text/plain', layer.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(e: DragEvent<HTMLLIElement>) => e.preventDefault()}
      onDrop={(e: DragEvent<HTMLLIElement>) => {
        e.stopPropagation()
        const id = e.dataTransfer.getData('text/plain') || null
        if (!id) return
        onDrop(id, 'sibling')
      }}
      onClick={onSelect}
      onContextMenu={(e) => {
        if (!onContextMenu) return
        e.preventDefault()
        // Select first so menu items act on this row even if it wasn't selected.
        onSelect()
        onContextMenu(e.clientX, e.clientY)
      }}
      className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-xs ${
        selected
          ? 'border-primary bg-accent/40'
          : 'border-border/60 bg-background/40 hover:bg-accent/20'
      }`}
      style={{ paddingLeft: padLeft }}
    >
      {isGroupRow ? (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpanded()
          }}
          className="flex h-3.5 w-3.5 items-center justify-center text-muted-foreground hover:text-foreground"
          title={t(groupExpanded ? 'pages.imageEditor.layers.collapse' : 'pages.imageEditor.layers.expand')}
        >
          {groupExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      ) : (
        <GripVertical className="h-3 w-3 cursor-grab text-muted-foreground/50" />
      )}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleVisible()
        }}
        className="text-muted-foreground hover:text-foreground"
      >
        {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
      {isGroupRow && (
        <span
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onDrop={(e) => {
            e.stopPropagation()
            e.preventDefault()
            const id = e.dataTransfer.getData('text/plain') || null
            if (!id) return
            onDrop(id, 'into')
          }}
          className="flex h-3.5 w-3.5 items-center justify-center text-muted-foreground"
          title={t('pages.imageEditor.layers.dropInto')}
        >
          {groupExpanded ? <FolderOpen className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />}
        </span>
      )}
      <span className="flex-1 truncate">{t(labelKey, labelArgs)}</span>
      {showFx && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onOpenStyle()
          }}
          className="rounded border border-border/60 px-1 font-mono text-[10px] italic text-primary hover:bg-accent/50"
          title={t('pages.imageEditor.layers.editStyle')}
        >
          fx
        </button>
      )}
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
  if (layer.kind === 'adjustment') {
    return `pages.imageEditor.adjustments.${layer.params.kind}`
  }
  if (layer.kind === 'filter') {
    return `pages.imageEditor.filters.${layer.params.kind}`
  }
  if (layer.kind === 'group') {
    return 'pages.imageEditor.annoLabel.group'
  }
  if (layer.kind === 'smartObject') {
    return 'pages.imageEditor.annoLabel.smartObject'
  }
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
      if (layer.shape.mode === 'dodge') return 'pages.imageEditor.annoLabel.dodge'
      if (layer.shape.mode === 'burn') return 'pages.imageEditor.annoLabel.burn'
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
    case 'note':
      return 'pages.imageEditor.annoLabel.note'
    case 'frame':
      return 'pages.imageEditor.annoLabel.frame'
    case 'path':
      return 'pages.imageEditor.annoLabel.path'
  }
}

/**
 * Walk `descendantId`'s ancestor chain in the tree and report whether
 * `maybeAncestorId` is among them. Used to refuse drops that would move a
 * group onto/into its own subtree (which would orphan the dragged subtree).
 */
function isAncestorOf(
  layers: Layer[],
  maybeAncestorId: string,
  descendantId: string,
): boolean {
  const path = findLayerPath(layers, descendantId)
  if (!path) return false
  let list = layers
  for (let i = 0; i < path.length - 1; i++) {
    const node = list[path[i]] as GroupLayer
    if (node.id === maybeAncestorId) return true
    list = node.children
  }
  return false
}
