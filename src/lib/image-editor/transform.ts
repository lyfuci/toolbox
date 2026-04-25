import type { HandleId } from './hit'
import type { Layer, Point, Rect, Shape } from './types'

/** Translate a layer by (dx, dy), in preview-canvas pixels. */
export function translateLayer(layer: Layer, dx: number, dy: number): Layer {
  if (layer.kind === 'mask') {
    return {
      ...layer,
      rects: layer.rects.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy })),
    }
  }
  return { ...layer, shape: translateShape(layer.shape, dx, dy) }
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
