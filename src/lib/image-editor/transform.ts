import type { HandleId } from './hit'
import type { EditorState, Layer, Point, Rect, Shape } from './types'

/** Translate a layer by (dx, dy), in preview-canvas pixels. */
export function translateLayer(layer: Layer, dx: number, dy: number): Layer {
  const clip = translatedClipFields(layer, dx, dy)
  if (layer.kind === 'mask') {
    return {
      ...layer,
      ...clip,
      rects: layer.rects.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy })),
    }
  }
  if (layer.kind === 'adjustment' || layer.kind === 'filter') {
    // Adjustments + filters cover the whole canvas — only the clip moves
    // with a translate.
    return { ...layer, ...clip }
  }
  return { ...layer, ...clip, shape: translateShape(layer.shape, dx, dy) }
}

/**
 * Compute the translated `clipRect`/`clipPath` for a layer. The clip moves
 * alongside the layer geometry so a layer's baked-in selection stays aligned
 * with its shape across the user-facing Move tool and the renderer's crop-shift
 * pass. Returns an empty object when there's no clip — callers spread it
 * unconditionally.
 */
function translatedClipFields(
  layer: Layer,
  dx: number,
  dy: number,
): { clipRect?: Rect; clipPath?: Point[] } {
  const out: { clipRect?: Rect; clipPath?: Point[] } = {}
  if (layer.clipRect) {
    out.clipRect = {
      ...layer.clipRect,
      x: layer.clipRect.x + dx,
      y: layer.clipRect.y + dy,
    }
  }
  if (layer.clipPath) {
    out.clipPath = layer.clipPath.map((p) => ({ x: p.x + dx, y: p.y + dy }))
  }
  return out
}

/**
 * Bake the active selection (if any) onto a freshly-committed layer as a
 * `clipRect`/`clipPath`. Selections with zero area are ignored — drawing into
 * an invisible clip would leave the user with mysteriously absent pixels.
 *
 * Once baked, the clip travels with the layer through undo/redo + project
 * save, and `translateLayer` keeps it aligned with the layer's geometry.
 */
export function withSelectionClip(layer: Layer, state: EditorState): Layer {
  const path = state.selectionPath
  if (path && path.length >= 3) {
    return { ...layer, clipPath: path.map((p) => ({ x: p.x, y: p.y })) }
  }
  const sel = state.selection
  if (sel && sel.w !== 0 && sel.h !== 0) {
    return { ...layer, clipRect: { ...sel } }
  }
  return layer
}

function translateShape(shape: Shape, dx: number, dy: number): Shape {
  switch (shape.kind) {
    case 'rect':
    case 'mosaic':
    case 'image':
    case 'ellipse':
    case 'blur':
    case 'frame':
    case 'note':
      return { ...shape, x: shape.x + dx, y: shape.y + dy }
    case 'arrow':
    case 'line':
      return {
        ...shape,
        x1: shape.x1 + dx,
        y1: shape.y1 + dy,
        x2: shape.x2 + dx,
        y2: shape.y2 + dy,
      }
    case 'text':
      return { ...shape, x: shape.x + dx, y: shape.y + dy }
    case 'brush':
      return {
        ...shape,
        points: shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      }
    case 'path':
      // Anchor handles are stored RELATIVE to their anchor — only the anchor
      // positions move on translation.
      return {
        ...shape,
        anchors: shape.anchors.map((a) => ({ ...a, x: a.x + dx, y: a.y + dy })),
      }
  }
}

/**
 * Apply a resize from dragging `handleId` of a layer to `newPoint`.
 *
 * - Rect/Mosaic/Mask: 4 corner handles, opposite corner stays anchored.
 * - Arrow: 2 endpoint handles, the other endpoint stays.
 * - Text/Brush: no resize handles, layer is returned unchanged.
 */
export function resizeLayer(
  layer: Layer,
  handleId: HandleId,
  newPoint: Point,
): Layer {
  if (layer.kind === 'mask') {
    if (layer.rects.length === 0) return layer
    return {
      ...layer,
      rects: [
        resizeRect(layer.rects[0], handleId, newPoint),
        ...layer.rects.slice(1),
      ],
    }
  }
  if (layer.kind === 'adjustment' || layer.kind === 'filter') {
    // Adjustment + filter layers have no resizable geometry; getHandles
    // returns [] for them so this branch shouldn't be reached, but keep it
    // as a no-op for safety.
    return layer
  }
  const s = layer.shape
  switch (s.kind) {
    case 'rect':
    case 'mosaic':
    case 'image':
    case 'ellipse':
    case 'blur':
    case 'frame': {
      const next = resizeRect({ x: s.x, y: s.y, w: s.w, h: s.h }, handleId, newPoint)
      return { ...layer, shape: { ...s, ...next } }
    }
    case 'arrow':
    case 'line':
      if (handleId === 'start') {
        return { ...layer, shape: { ...s, x1: newPoint.x, y1: newPoint.y } }
      }
      if (handleId === 'end') {
        return { ...layer, shape: { ...s, x2: newPoint.x, y2: newPoint.y } }
      }
      return layer
    default:
      return layer
  }
}

/**
 * Drag one corner of a rect to `p`, keeping the opposite corner fixed.
 * Returns possibly-flipped (negative w/h) rect — callers/render normalize.
 */
function resizeRect(r: Rect, handleId: HandleId, p: Point): Rect {
  // Compute the four corners of the current bbox.
  const x1 = r.w >= 0 ? r.x : r.x + r.w
  const y1 = r.h >= 0 ? r.y : r.y + r.h
  const x2 = x1 + Math.abs(r.w)
  const y2 = y1 + Math.abs(r.h)

  let nx1 = x1
  let ny1 = y1
  let nx2 = x2
  let ny2 = y2
  if (handleId === 'nw') {
    nx1 = p.x
    ny1 = p.y
  } else if (handleId === 'ne') {
    nx2 = p.x
    ny1 = p.y
  } else if (handleId === 'se') {
    nx2 = p.x
    ny2 = p.y
  } else if (handleId === 'sw') {
    nx1 = p.x
    ny2 = p.y
  }
  return { x: nx1, y: ny1, w: nx2 - nx1, h: ny2 - ny1 }
}

/** Did the layer actually change? Used to skip no-op history pushes. */
export function layerEquals(a: Layer, b: Layer): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
