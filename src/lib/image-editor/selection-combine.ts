import { extractMaskContour } from './mask-contour'
import { PREVIEW_MAX } from './defaults'
import { dimsAfterRotation } from './render'
import type { EditorState, Point, Rect } from './types'

/**
 * PS-style selection combination modes. `replace` overwrites the existing
 * selection (no modifier held); the others combine with the active one.
 */
export type SelectionModifier = 'replace' | 'add' | 'subtract' | 'intersect'

/**
 * Combine the existing selection with a freshly-drawn rect according to the
 * modifier. Rasterizes both shapes into a 1-bit mask at preview-pixel
 * resolution, applies the boolean op via the 2D Canvas composite ops, and
 * extracts the resulting polygon via Moore boundary tracing.
 *
 * Coordinates everywhere are in original-image preview-pixel space — same
 * frame the active selection lives in.
 */
export function combineRectSelection(
  state: EditorState,
  fresh: Rect,
  mod: Exclude<SelectionModifier, 'replace'>,
  image: HTMLImageElement | null,
): Partial<EditorState> {
  return combineSelection(state, undefined, fresh, mod, image)
}

/**
 * Path-input variant. The lasso / poly lasso commits points + a bbox; we
 * use the polygon for the boolean op + return a polygonal `selectionPath`.
 */
export function combinePathSelection(
  state: EditorState,
  path: Point[],
  bbox: Rect,
  mod: Exclude<SelectionModifier, 'replace'>,
  image: HTMLImageElement | null,
): Partial<EditorState> {
  return combineSelection(state, path, bbox, mod, image)
}

function combineSelection(
  state: EditorState,
  freshPath: Point[] | undefined,
  freshBBox: Rect,
  mod: Exclude<SelectionModifier, 'replace'>,
  image: HTMLImageElement | null,
): Partial<EditorState> {
  if (!image || !state.selection) {
    return { selection: freshBBox, selectionPath: freshPath, selectionInverse: false }
  }
  // Selection coords live in *pre-crop* original-image preview-pixel space.
  // We rasterize at base preview dimensions (NOT previewDimsOf, which
  // shrinks to the crop rect) so coords outside the crop still land inside
  // the canvas — otherwise a Shift+drag after cropping would silently
  // clip the existing selection.
  const { baseW, baseH } = dimsAfterRotation(image, state)
  const previewScale = Math.min(1, PREVIEW_MAX / Math.max(baseW, baseH, 1))
  const w = Math.max(1, Math.round(baseW * previewScale))
  const h = Math.max(1, Math.round(baseH * previewScale))

  // Rasterize the previous selection into a fresh canvas.
  const prev = document.createElement('canvas')
  prev.width = w
  prev.height = h
  const pctx = prev.getContext('2d')
  if (!pctx) return { selection: freshBBox, selectionPath: freshPath }
  pctx.fillStyle = '#fff'
  fillSelectionInto(pctx, state.selectionPath, state.selection, state.selectionInverse, w, h)

  // Rasterize the fresh selection into a second canvas.
  const next = document.createElement('canvas')
  next.width = w
  next.height = h
  const nctx = next.getContext('2d')
  if (!nctx) return { selection: freshBBox, selectionPath: freshPath }
  nctx.fillStyle = '#fff'
  fillSelectionInto(nctx, freshPath, freshBBox, false, w, h)

  // Apply the boolean op on `prev` (the destination).
  switch (mod) {
    case 'add':
      pctx.globalCompositeOperation = 'source-over'
      pctx.drawImage(next, 0, 0)
      break
    case 'subtract':
      pctx.globalCompositeOperation = 'destination-out'
      pctx.drawImage(next, 0, 0)
      break
    case 'intersect':
      pctx.globalCompositeOperation = 'destination-in'
      pctx.drawImage(next, 0, 0)
      break
  }

  let data: ImageData
  try {
    data = pctx.getImageData(0, 0, w, h)
  } catch {
    return { selection: freshBBox, selectionPath: freshPath }
  }

  // Compute bbox + polygon from the combined mask.
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (data.data[i + 3] > 0 && data.data[i] > 127) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) {
    // Empty result — clear selection.
    return { selection: undefined, selectionPath: undefined, selectionInverse: false }
  }
  const path = extractMaskContour(data.data, w, h, { threshold: 127, maxPoints: 400 })
  return {
    selection: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    selectionPath: path.length >= 3 ? path : undefined,
    selectionInverse: false,
  }
}

/**
 * Fill a selection shape (path > rect > inverse rect) into the given ctx.
 * Used as the rasterization step before boolean compositing.
 */
function fillSelectionInto(
  ctx: CanvasRenderingContext2D,
  path: Point[] | undefined,
  rect: Rect,
  inverse: boolean | undefined,
  w: number,
  h: number,
) {
  if (path && path.length >= 3) {
    if (inverse) {
      ctx.beginPath()
      ctx.rect(0, 0, w, h)
      ctx.moveTo(path[0].x, path[0].y)
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x, path[i].y)
      }
      ctx.closePath()
      ctx.fill('evenodd')
      return
    }
    ctx.beginPath()
    ctx.moveTo(path[0].x, path[0].y)
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y)
    }
    ctx.closePath()
    ctx.fill()
    return
  }
  const rx = Math.min(rect.x, rect.x + rect.w)
  const ry = Math.min(rect.y, rect.y + rect.h)
  const rw = Math.abs(rect.w)
  const rh = Math.abs(rect.h)
  if (inverse) {
    ctx.beginPath()
    ctx.rect(0, 0, w, h)
    ctx.rect(rx, ry, rw, rh)
    ctx.fill('evenodd')
    return
  }
  ctx.fillRect(rx, ry, rw, rh)
}
