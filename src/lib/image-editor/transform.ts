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
  if (layer.kind === 'group') {
    // Translate the group's own clip + each child recursively so a Move
    // operation on a group shifts everything inside it as a unit.
    return {
      ...layer,
      ...clip,
      children: layer.children.map((c) => translateLayer(c, dx, dy)),
    }
  }
  if (layer.kind === 'smartObject') {
    // Smart object: translate its non-destructive transform (which carries
    // both the bbox origin and the rotation pivot).
    return {
      ...layer,
      ...clip,
      transform: {
        ...layer.transform,
        x: layer.transform.x + dx,
        y: layer.transform.y + dy,
        anchorX: layer.transform.anchorX + dx,
        anchorY: layer.transform.anchorY + dy,
      },
    }
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
 * `clipRect`/`clipPath` (+ `clipInverse` when state.selectionInverse is set).
 * Selections with zero area are ignored — drawing into an invisible clip
 * would leave the user with mysteriously absent pixels.
 *
 * Once baked, the clip travels with the layer through undo/redo + project
 * save, and `translateLayer` keeps it aligned with the layer's geometry.
 *
 * Inverted selections: `clipInverse: true` flows through; the renderer pairs
 * the stored ring with an outer canvas-rect under evenodd fill at draw time.
 * No selection at all + inverse=true means "the whole canvas is selected"
 * (PS semantics), so the layer is returned with no clip.
 */
export function withSelectionClip(layer: Layer, state: EditorState): Layer {
  const inverse = !!state.selectionInverse
  const path = state.selectionPath
  if (path && path.length >= 3) {
    return {
      ...layer,
      clipPath: path.map((p) => ({ x: p.x, y: p.y })),
      clipInverse: inverse || undefined,
    }
  }
  const sel = state.selection
  if (sel && sel.w !== 0 && sel.h !== 0) {
    return { ...layer, clipRect: { ...sel }, clipInverse: inverse || undefined }
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
  if (
    layer.kind === 'adjustment' ||
    layer.kind === 'filter' ||
    layer.kind === 'group'
  ) {
    return layer
  }
  if (layer.kind === 'smartObject') {
    return resizeSmartObject(layer, handleId, newPoint)
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
  } else if (handleId === 'n') {
    ny1 = p.y
  } else if (handleId === 's') {
    ny2 = p.y
  } else if (handleId === 'e') {
    nx2 = p.x
  } else if (handleId === 'w') {
    nx1 = p.x
  }
  return { x: nx1, y: ny1, w: nx2 - nx1, h: ny2 - ny1 }
}

/**
 * Smart Object resize / rotate. Handles dragged in preview-pixel space
 * (`newPoint`) update the layer's non-destructive transform — bbox for
 * corner / side handles, rotation for the 'rotate' handle. Anchor follows
 * the bbox centre so resize / rotation stay centred without surprising
 * jumps in the next operation.
 */
function resizeSmartObject(
  layer: import('./types').SmartObjectLayer,
  handleId: HandleId,
  newPoint: Point,
): Layer {
  const t = layer.transform
  if (handleId === 'rotate') {
    // Rotation around the bbox centre. Compute the angle from centre to
    // the new pointer position relative to the centre→top axis.
    const cx = t.x + t.w / 2
    const cy = t.y + t.h / 2
    const dx = newPoint.x - cx
    const dy = newPoint.y - cy
    // Angle 0 = pointer directly above (PS convention). atan2(dy, dx) returns
    // counter-clockwise from +x; we offset and flip sign so dragging clockwise
    // increases the rotation field.
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90
    // Normalize to [-180, 180].
    const normalized = ((deg + 540) % 360) - 180
    return { ...layer, transform: { ...t, rotation: normalized } }
  }
  // Pre-rotation: apply the inverse rotation to the pointer so the bbox
  // edit math stays in the SO's local frame. Centre is the rotation pivot.
  const cx = t.x + t.w / 2
  const cy = t.y + t.h / 2
  const r = (-t.rotation * Math.PI) / 180
  const lx = Math.cos(r) * (newPoint.x - cx) - Math.sin(r) * (newPoint.y - cy) + cx
  const ly = Math.sin(r) * (newPoint.x - cx) + Math.cos(r) * (newPoint.y - cy) + cy
  const next = resizeRect({ x: t.x, y: t.y, w: t.w, h: t.h }, handleId, { x: lx, y: ly })
  return {
    ...layer,
    transform: {
      ...t,
      x: next.x,
      y: next.y,
      w: next.w,
      h: next.h,
      // Keep anchor centred — Free Transform's natural feel.
      anchorX: next.x + next.w / 2,
      anchorY: next.y + next.h / 2,
    },
  }
}

/** Did the layer actually change? Used to skip no-op history pushes. */
export function layerEquals(a: Layer, b: Layer): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Scale a layer's geometry by (sx, sy) — used by Image Size after the
 * underlying image is resampled, so layer shapes stay anchored to the same
 * pixels. Operates uniformly across all shape kinds + group children + SO
 * transforms + masks + clips. Does NOT touch rotation, opacity, blend, or
 * other non-geometric fields.
 */
export function scaleLayer(layer: Layer, sx: number, sy: number): Layer {
  const clip: { clipRect?: Rect; clipPath?: Point[] } = {}
  if (layer.clipRect) {
    clip.clipRect = scaleRect(layer.clipRect, sx, sy)
  }
  if (layer.clipPath) {
    clip.clipPath = layer.clipPath.map((p) => ({ x: p.x * sx, y: p.y * sy }))
  }
  if (layer.kind === 'mask') {
    return { ...layer, ...clip, rects: layer.rects.map((r) => scaleRect(r, sx, sy)) }
  }
  if (layer.kind === 'adjustment' || layer.kind === 'filter') {
    return { ...layer, ...clip }
  }
  if (layer.kind === 'group') {
    return {
      ...layer,
      ...clip,
      children: layer.children.map((c) => scaleLayer(c, sx, sy)),
    }
  }
  if (layer.kind === 'smartObject') {
    const t = layer.transform
    return {
      ...layer,
      ...clip,
      transform: {
        ...t,
        x: t.x * sx,
        y: t.y * sy,
        w: t.w * sx,
        h: t.h * sy,
        anchorX: t.anchorX * sx,
        anchorY: t.anchorY * sy,
      },
    }
  }
  return { ...layer, ...clip, shape: scaleShape(layer.shape, sx, sy) }
}

function scaleRect(r: Rect, sx: number, sy: number): Rect {
  return { x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy }
}

function scaleShape(shape: Shape, sx: number, sy: number): Shape {
  // Use the average for thickness/font fields where one number must cover both axes.
  const sAvg = (sx + sy) / 2
  switch (shape.kind) {
    case 'rect':
    case 'mosaic':
    case 'image':
    case 'ellipse':
    case 'blur':
    case 'frame':
      return { ...shape, x: shape.x * sx, y: shape.y * sy, w: shape.w * sx, h: shape.h * sy }
    case 'arrow':
    case 'line':
      return {
        ...shape,
        x1: shape.x1 * sx,
        y1: shape.y1 * sy,
        x2: shape.x2 * sx,
        y2: shape.y2 * sy,
        strokeWidth: shape.strokeWidth * sAvg,
      }
    case 'text':
      return { ...shape, x: shape.x * sx, y: shape.y * sy, fontSize: shape.fontSize * sAvg }
    case 'brush':
      return {
        ...shape,
        points: shape.points.map((p) => ({ x: p.x * sx, y: p.y * sy })),
        strokeWidth: shape.strokeWidth * sAvg,
      }
    case 'note':
      return { ...shape, x: shape.x * sx, y: shape.y * sy }
    case 'path':
      return {
        ...shape,
        anchors: shape.anchors.map((a) => ({
          ...a,
          x: a.x * sx,
          y: a.y * sy,
          hin: a.hin ? { x: a.hin.x * sx, y: a.hin.y * sy } : undefined,
          hout: a.hout ? { x: a.hout.x * sx, y: a.hout.y * sy } : undefined,
        })),
        strokeWidth: shape.strokeWidth * sAvg,
      }
  }
}
