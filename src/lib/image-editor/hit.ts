import type { Layer, Point, Rect, Shape } from './types'

export type HandleId =
  | 'nw'
  | 'ne'
  | 'se'
  | 'sw' // rect-like corner handles
  | 'n'
  | 'e'
  | 's'
  | 'w' // side midpoint handles (Free Transform)
  | 'rotate' // rotation handle floating above the bbox
  | 'start'
  | 'end' // arrow endpoint handles
  | `path-anchor-${number}` // direct-selection handles on a PathShape

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
  if (layer.kind === 'adjustment' || layer.kind === 'filter') {
    // Adjustment + filter layers cover the entire canvas (subject to clip).
    // The layers panel still needs to be able to select them, so we return
    // the clip if one's set; otherwise no bbox (clicking the canvas can't
    // pick one — the user uses the layers panel instead).
    if (layer.clipRect) return normalizeRect(layer.clipRect)
    return null
  }
  if (layer.kind === 'group') {
    // Union of child bboxes — gives the panel selection chrome something
    // sensible to draw and lets canvas hit-tests on a collapsed group return
    // an id when the user clicks within any visible child's area.
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let any = false
    for (const c of layer.children) {
      if (!c.visible) continue
      const b = getLayerBBox(c)
      if (!b) continue
      any = true
      if (b.x < minX) minX = b.x
      if (b.y < minY) minY = b.y
      if (b.x + b.w > maxX) maxX = b.x + b.w
      if (b.y + b.h > maxY) maxY = b.y + b.h
    }
    if (!any) return null
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }
  if (layer.kind === 'smartObject') {
    // Pre-rotation footprint stored directly on the transform — no state
    // access required. (Free Transform's handle UI uses the rotated quad.)
    const t = layer.transform
    return normalizeRect({ x: t.x, y: t.y, w: t.w, h: t.h })
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
    case 'frame':
      return normalizeRect({ x: shape.x, y: shape.y, w: shape.w, h: shape.h })
    case 'note':
      // Notes render as a 16-px sticky icon — bbox covers the icon so the
      // user can click it to select / move.
      return { x: shape.x, y: shape.y, w: 16, h: 16 }
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
    case 'path': {
      if (shape.anchors.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const a of shape.anchors) {
        const xs = [a.x, a.hin && a.x + a.hin.x, a.hout && a.x + a.hout.x]
        const ys = [a.y, a.hin && a.y + a.hin.y, a.hout && a.y + a.hout.y]
        for (const v of xs) if (v !== undefined) {
          if (v < minX) minX = v
          if (v > maxX) maxX = v
        }
        for (const v of ys) if (v !== undefined) {
          if (v < minY) minY = v
          if (v > maxY) maxY = v
        }
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
 * top→bottom (last in array = topmost) and returns the first hit. Descends
 * into expanded groups so a click on a child returns that child's id; a
 * click on any descendant of a *collapsed* group returns the group's id
 * (matches the panel's disclosure state — the user can't reach the child
 * from the panel either while the group is collapsed).
 *
 * Skips hidden layers (and hidden groups, recursively).
 */
/**
 * Direct-selection-style hit-test: walks the tree topmost-first looking
 * for a path-anchor handle within `HANDLE_HIT_RADIUS` of `p`. Returns the
 * (layerId, handleId) of the first match. Used by the arrowPath tool so
 * the user can grab an anchor on a path layer that isn't currently
 * selected — without this, the first click selects the layer and the
 * user has to click again to grab the anchor.
 */
export function pickPathAnchor(
  layers: Layer[],
  p: Point,
): { layerId: string; handleId: HandleId } | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]
    if (!layer.visible) continue
    if (layer.kind === 'group') {
      const inner = pickPathAnchor(layer.children, p)
      if (inner) return inner
      continue
    }
    if (layer.kind === 'annotation' && layer.shape.kind === 'path') {
      const handle = pickHandle(getHandles(layer), p)
      if (handle) return { layerId: layer.id, handleId: handle.id }
    }
  }
  return null
}

export function pickLayer(layers: Layer[], p: Point): string | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]
    if (!layer.visible) continue
    if (layer.kind === 'group') {
      const inner = pickLayer(layer.children, p)
      if (inner !== null) return layer.expanded ? inner : layer.id
      continue
    }
    if (layer.kind === 'smartObject' && layer.transform.rotation !== 0) {
      // Rotated SO: inverse-rotate the click point around the bbox centre,
      // then check against the pre-rotation bbox. Without this, hit-test on a
      // 45°-rotated SO would fail to pick the visible (rotated) content.
      const t = layer.transform
      const cx = t.x + t.w / 2
      const cy = t.y + t.h / 2
      const r = (-t.rotation * Math.PI) / 180
      const lx = Math.cos(r) * (p.x - cx) - Math.sin(r) * (p.y - cy) + cx
      const ly = Math.sin(r) * (p.x - cx) + Math.cos(r) * (p.y - cy) + cy
      if (pointInBBox({ x: lx, y: ly }, { x: t.x, y: t.y, w: t.w, h: t.h })) {
        return layer.id
      }
      continue
    }
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
  if (layer.kind === 'adjustment' || layer.kind === 'filter' || layer.kind === 'group') {
    // Cover the whole canvas (subject to clip); no resize handles. Move/
    // resize through the layers panel instead if ever needed. Groups: the
    // user resizes group contents by selecting individual children.
    return []
  }
  if (layer.kind === 'smartObject') {
    // Smart Objects ship the full 8-handle + rotation set so the selection
    // chrome doubles as Free Transform. Coordinates honour the layer's
    // existing transform.x/y/w/h; rotation handle floats 24 preview-px
    // above the bbox centre-top (pre-rotation; renderer applies the
    // current rotation at draw time).
    return rectEightHandlesWithRotate({
      x: layer.transform.x,
      y: layer.transform.y,
      w: layer.transform.w,
      h: layer.transform.h,
    })
  }
  switch (layer.shape.kind) {
    case 'rect':
    case 'mosaic':
    case 'image':
    case 'ellipse':
    case 'blur':
    case 'frame':
      // 4 corners + rotation handle (Free Transform — any layer can now
      // rotate via the floating handle above the bbox centre-top).
      return rectEightHandlesWithRotate(
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
    case 'path':
      // Direct selection: one handle per anchor. Anchor handles are
      // returned with the same Handle type as resize handles; the
      // template-literal HandleId (`path-anchor-${n}`) lets pickHandle
      // and resizeLayer dispatch on it without a new helper.
      return layer.shape.anchors.map((a, i) => ({
        id: `path-anchor-${i}` as HandleId,
        x: a.x,
        y: a.y,
      }))
    case 'text':
    case 'brush':
    case 'note':
      // Move-only by design (resizing a 16-px icon makes little sense).
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

/** 4 corners + 4 mid-sides + 1 rotation handle. Used by Smart Object's
 *  Free-Transform-style selection chrome. The rotation handle sits 24
 *  preview-px above the top edge centre. */
function rectEightHandlesWithRotate(r: Rect): Handle[] {
  return [
    { id: 'nw', x: r.x, y: r.y },
    { id: 'n', x: r.x + r.w / 2, y: r.y },
    { id: 'ne', x: r.x + r.w, y: r.y },
    { id: 'e', x: r.x + r.w, y: r.y + r.h / 2 },
    { id: 'se', x: r.x + r.w, y: r.y + r.h },
    { id: 's', x: r.x + r.w / 2, y: r.y + r.h },
    { id: 'sw', x: r.x, y: r.y + r.h },
    { id: 'w', x: r.x, y: r.y + r.h / 2 },
    { id: 'rotate', x: r.x + r.w / 2, y: r.y - 24 },
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
