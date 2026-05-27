import { normalizeRect } from './hit'
import type { Point, Rect } from './types'

/**
 * Shared rasterizer that turns a selection's geometry into an 8-bit alpha
 * mask canvas (opaque white = fully selected, transparent = unselected). When
 * `feather` > 0 the edge is Gaussian-blurred so consumers can multiply it onto
 * their output via `destination-in` for a soft selection edge.
 *
 * Why a single helper: feather has to look identical whether you Fill, Stroke,
 * or run an Adjustment inside the selection. Each of those sites builds its
 * canvas at a different resolution (source-resolution for Fill/Stroke, target-
 * buffer resolution for the render pipeline), so callers pass `feather` already
 * scaled into the *same* pixel space as `w`/`h` — see `withSelectionClip` /
 * `scaleFilterParams` for the convention (radii live in preview-canvas pixels
 * and get multiplied by the bake scale).
 *
 * `inverse` flips the mask (PS Select > Inverse): the soft band sits on the
 * same iso-line, just with selected/unselected swapped.
 */
export function buildSelectionMaskCanvas(args: {
  w: number
  h: number
  /** Geometry in the SAME pixel space as `w`/`h`. Path wins over rect. */
  path?: Point[]
  rect?: Rect
  /** Blur radius in `w`/`h` pixels. 0 → crisp edge. */
  feather: number
  inverse?: boolean
}): HTMLCanvasElement | null {
  const { w, h, path, rect, feather, inverse } = args
  if (w < 1 || h < 1) return null

  // 1. Rasterize the crisp shape (opaque white on transparent).
  const shape = document.createElement('canvas')
  shape.width = w
  shape.height = h
  const sctx = shape.getContext('2d')
  if (!sctx) return null
  sctx.fillStyle = '#fff'
  fillShape(sctx, path, rect)

  // 2. Feather: blur the crisp shape into a second canvas. The canvas `filter`
  //    Gaussian blur matches PS feather closely enough for v1; radius ≈ the
  //    feather amount (PS feathers ~half on each side of the edge).
  let mask = shape
  if (feather > 0) {
    const blurred = document.createElement('canvas')
    blurred.width = w
    blurred.height = h
    const bctx = blurred.getContext('2d')
    if (!bctx) return null
    bctx.filter = `blur(${feather}px)`
    bctx.drawImage(shape, 0, 0)
    mask = blurred
  }

  if (!inverse) return mask

  // 3. Inverse: subtract the (possibly feathered) mask from a fully-opaque
  //    field so the soft band survives on the flipped side.
  const inv = document.createElement('canvas')
  inv.width = w
  inv.height = h
  const ictx = inv.getContext('2d')
  if (!ictx) return null
  ictx.fillStyle = '#fff'
  ictx.fillRect(0, 0, w, h)
  ictx.globalCompositeOperation = 'destination-out'
  ictx.drawImage(mask, 0, 0)
  return inv
}

/** Trace + fill a selection shape (path preferred, else rect) as a solid fill. */
function fillShape(
  ctx: CanvasRenderingContext2D,
  path: Point[] | undefined,
  rect: Rect | undefined,
) {
  if (path && path.length >= 3) {
    ctx.beginPath()
    ctx.moveTo(path[0].x, path[0].y)
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y)
    ctx.closePath()
    ctx.fill()
    return
  }
  if (rect && rect.w !== 0 && rect.h !== 0) {
    const r = normalizeRect(rect)
    ctx.fillRect(r.x, r.y, r.w, r.h)
  }
}
