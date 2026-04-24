import type { Layer, Point, Rect, Shape } from './types'

export type HandleId =
  | 'nw'
  | 'ne'
  | 'se'
  | 'sw' // rect-like corner handles
  | 'start'
  | 'end' // arrow endpoint handles

export type Handle = { id: HandleId; x: number; y: number }

/** Hit radius for handles in preview-canvas pixels. */
export const HANDLE_HIT_RADIUS = 8

/**
 * Bounding box of a layer in preview-canvas pixels, normalized so w,h ≥ 0.
 * Returns null for masks with no rects (shouldn't happen in normal use).
 */
export function getLayerBBox(layer: Layer): Rect | null {
  if (layer.kind === 'mask') {
    if (layer.rects.length === 0) return null
    // v1: a mask is a single rect.
    return normalizeRect(layer.rects[0])
  }
  return getShapeBBox(layer.shape)
}

function getShapeBBox(shape: Shape): Rect {
  switch (shape.kind) {
    case 'rect':
    case 'mosaic':
    case 'image':
    case 'ellipse':
    case 'blur':
      return normalizeRect({ x: shape.x, y: shape.y, w: shape.w, h: shape.h })
    case 'arrow':
    case 'line': {
      const x = Math.min(shape.x1, shape.x2)
      const y = Math.min(shape.y1, shape.y2)
      const w = Math.abs(shape.x2 - shape.x1)
      const h = Math.abs(shape.y2 - shape.y1)
      const pad = Math.max(shape.strokeWidth, 4)
      return { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 }
    }
    case 'text': {
      // Approximate; sans-serif average ~0.6 em per char.
      const w = Math.max(shape.fontSize * 0.5, shape.text.length * shape.fontSize * 0.6)
      const h = shape.fontSize * 1.2
      return { x: shape.x, y: shape.y, w, h }
    }
    case 'brush': {
      if (shape.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const p of shape.points) {
        if (p.x < minX) minX = p.x
        if (p.y < minY) minY = p.y
        if (p.x > maxX) maxX = p.x
        if (p.y > maxY) maxY = p.y
      }
      const pad = shape.strokeWidth / 2 + 2
      return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
    }
  }
}

export function normalizeRect(r: Rect): Rect {
  return {
    x: r.w >= 0 ? r.x : r.x + r.w,
    y: r.h >= 0 ? r.y : r.y + r.h,
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  }
}

export function pointInBBox(p: Point, b: Rect): boolean {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h
}

/**
 * Find the topmost layer whose bbox contains the point. Walks layers
 * top→bottom (last in array = topmost) and returns the first hit.
 * Skips hidden layers.
 */
export function pickLayer(layers: Layer[], p: Point): string | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]
    if (!layer.visible) continue
    const bbox = getLayerBBox(layer)
    if (bbox && pointInBBox(p, bbox)) return layer.id
  }
  return null
}

/**
 * Resize handles for a selected layer. Empty for non-resizable layer types
 * (text, brush, eraser-stroke), which only support move.
 */
export function getHandles(layer: Layer): Handle[] {
  if (layer.kind === 'mask') {
    if (layer.rects.length === 0) return []
    return rectCornerHandles(normalizeRect(layer.rects[0]))
  }
  switch (layer.shape.kind) {
    case 'rect':
    case 'mosaic':
    case 'image':
    case 'ellipse':
    case 'blur':
      return rectCornerHandles(
        normalizeRect({
          x: layer.shape.x,
          y: layer.shape.y,
          w: layer.shape.w,
          h: layer.shape.h,
        }),
      )
    case 'arrow':
    case 'line':
      return [
        { id: 'start', x: layer.shape.x1, y: layer.shape.y1 },
        { id: 'end', x: layer.shape.x2, y: layer.shape.y2 },
      ]
    case 'text':
    case 'brush':
      return []
  }
}

function rectCornerHandles(r: Rect): Handle[] {
  return [
    { id: 'nw', x: r.x, y: r.y },
    { id: 'ne', x: r.x + r.w, y: r.y },
    { id: 'se', x: r.x + r.w, y: r.y + r.h },
    { id: 'sw', x: r.x, y: r.y + r.h },
  ]
}

export function pickHandle(
  handles: Handle[],
  p: Point,
  hitRadius = HANDLE_HIT_RADIUS,
): Handle | null {
  for (const h of handles) {
    if (Math.abs(p.x - h.x) <= hitRadius && Math.abs(p.y - h.y) <= hitRadius) {
      return h
    }
  }
  return null
}
