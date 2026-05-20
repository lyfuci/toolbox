import { extractMaskContour } from './mask-contour'
import { PREVIEW_MAX } from './defaults'
import { dimsAfterRotation } from './render'
import type {
  AnnotationLayer,
  EditorState,
  PathAnchor,
  PathShape,
  Point,
} from './types'

/**
 * Convert the editor's active selection into a closed PathShape annotation
 * layer ("Make Work Path" in PS).
 *
 * - Lasso / Polygonal Lasso (polygon selectionPath) → straight-segment path
 *   directly from those vertices, simplified if the count is huge.
 * - Marquee (rect selection, no path) → rect-shaped 4-anchor path.
 *
 * Returns the new annotation layer ready for commitLayer / history.set —
 * caller decides where it sits in the stack. Returns null when there's no
 * selection.
 */
export function makeWorkPathLayer(
  state: EditorState,
  name: string,
): AnnotationLayer | null {
  if (!state.selection) return null
  const sel = state.selection
  const path = state.selectionPath
  let anchors: PathAnchor[]
  if (path && path.length >= 3) {
    anchors = simplifyAnchors(path).map((p) => ({ x: p.x, y: p.y }))
  } else {
    const x0 = Math.min(sel.x, sel.x + sel.w)
    const y0 = Math.min(sel.y, sel.y + sel.h)
    const w = Math.abs(sel.w)
    const h = Math.abs(sel.h)
    anchors = [
      { x: x0, y: y0 },
      { x: x0 + w, y: y0 },
      { x: x0 + w, y: y0 + h },
      { x: x0, y: y0 + h },
    ]
  }
  const shape: PathShape = {
    kind: 'path',
    anchors,
    closed: true,
    color: '#88aaff',
    strokeWidth: 1,
  }
  return {
    id: crypto.randomUUID(),
    name,
    visible: true,
    opacity: 100,
    blend: 'normal',
    kind: 'annotation',
    shape,
  }
}

/**
 * Compute a selection (bbox + polygon) from a closed PathShape's outline.
 * For an open path, we still close the polygon by connecting the last
 * anchor back to the first — same as PS's "Make Selection" on an open
 * work path.
 *
 * Bezier curves between anchors are flattened into line segments (16
 * samples per segment) so a curvy path produces a smoother polygon
 * outline. The returned path is in original-image preview-pixel space.
 */
export function selectionFromPath(path: PathShape): {
  bbox: { x: number; y: number; w: number; h: number }
  path: Point[]
} | null {
  if (path.anchors.length < 2) return null
  const polygon: Point[] = []
  const N = path.anchors.length
  for (let i = 0; i < N; i++) {
    const a = path.anchors[i]
    const b = path.anchors[(i + 1) % N]
    polygon.push({ x: a.x, y: a.y })
    // Flatten the segment to b.
    if (i === N - 1 && !path.closed) break
    if (a.hout || b.hin) {
      const p0 = a
      const p1 = a.hout ? { x: a.x + a.hout.x, y: a.y + a.hout.y } : a
      const p2 = b.hin ? { x: b.x + b.hin.x, y: b.y + b.hin.y } : b
      const p3 = b
      const STEPS = 16
      for (let s = 1; s < STEPS; s++) {
        const t = s / STEPS
        polygon.push(cubicBezier(p0, p1, p2, p3, t))
      }
    }
  }
  if (polygon.length < 3) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of polygon) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return {
    bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    path: polygon,
  }
}

/**
 * Trace an arbitrary closed Path through the existing mask-contour pipeline
 * to produce a tight polygon — same trick selection-combine uses. Lets the
 * caller round-trip a wildly curvy Pen path through pixels without keeping
 * thousands of bezier samples in selectionPath.
 *
 * Used when the polygon flattening above produces too many points for the
 * UI to handle smoothly; selectionFromPath falls back to this when N > 800.
 */
export function selectionFromPathViaMask(
  state: EditorState,
  image: HTMLImageElement,
  polygon: Point[],
): { bbox: { x: number; y: number; w: number; h: number }; path: Point[] } | null {
  const { baseW, baseH } = dimsAfterRotation(image, state)
  const previewScale = Math.min(1, PREVIEW_MAX / Math.max(baseW, baseH, 1))
  const w = Math.max(1, Math.round(baseW * previewScale))
  const h = Math.max(1, Math.round(baseH * previewScale))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(polygon[0].x, polygon[0].y)
  for (let i = 1; i < polygon.length; i++) {
    ctx.lineTo(polygon[i].x, polygon[i].y)
  }
  ctx.closePath()
  ctx.fill()
  let data: ImageData
  try {
    data = ctx.getImageData(0, 0, w, h)
  } catch {
    return null
  }
  const refined = extractMaskContour(data.data, w, h, { threshold: 127, maxPoints: 400 })
  if (refined.length < 3) return null
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
  return {
    bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    path: refined,
  }
}

function cubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const it = 1 - t
  const w0 = it * it * it
  const w1 = 3 * it * it * t
  const w2 = 3 * it * t * t
  const w3 = t * t * t
  return {
    x: w0 * p0.x + w1 * p1.x + w2 * p2.x + w3 * p3.x,
    y: w0 * p0.y + w1 * p1.y + w2 * p2.y + w3 * p3.y,
  }
}

/**
 * Reduce dense polygon (e.g., lasso) to ~32 anchors via uniform sampling.
 * Lasso traces can carry 300+ raw points; that's too much state for a path
 * the user might want to hand-edit.
 */
function simplifyAnchors(points: Point[]): Point[] {
  if (points.length <= 32) return points
  const out: Point[] = []
  const stride = points.length / 32
  for (let i = 0; i < points.length; i += stride) {
    out.push(points[Math.floor(i)])
  }
  return out
}
