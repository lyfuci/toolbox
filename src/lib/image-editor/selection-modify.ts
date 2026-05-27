import { extractMaskContour } from './mask-contour'
import type { Point, Rect } from './types'

/**
 * Selection-modify operations that need a *rasterized* view of the selection
 * (unlike the bbox-only transforms in `selection-ops.ts`). These two ops —
 * Smooth (Select > Modify > Smooth) and Grow (Select > Grow) — can't be
 * expressed as pure rect arithmetic: Smooth has to round real polygon corners
 * and Grow has to inspect image pixels. Both therefore go through a single-
 * channel `Uint8Array` mask (255 = inside) that we fill / blur / flood, then
 * re-trace into a polygon via `extractMaskContour`.
 *
 * Everything here works on plain typed arrays and integer geometry so the
 * whole module is node-testable — no DOM canvas required. Coordinates are in
 * preview-pixel space; `w`/`h` are the preview-canvas dimensions used as the
 * rasterization bounds.
 */

/** RGBA threshold `extractMaskContour` uses by default — we mirror it so the
 *  rasterize → blur → threshold → trace round-trip stays self-consistent. */
const CONTOUR_THRESHOLD = 127

/**
 * Scanline-fill a polygon (preferred) or a rect into a fresh `w*h`
 * `Uint8Array`, writing 255 for cells inside the shape and 0 outside.
 *
 * Exported so the wiring layer can build the `currentMask` argument for
 * `growSelection` from a selectionPath/selection without re-implementing
 * polygon rasterization, and reused internally by `smoothSelection`. A
 * polygon `path` (>= 3 points) wins over `rect`; if neither is usable the
 * mask comes back all-zero (an empty selection rasterizes to nothing).
 *
 * The scanline uses the half-open vertical rule `y0 <= y < y1` so shared
 * vertices aren't counted twice — without it, diamond-shaped polygons fill
 * incorrectly at their top/bottom extrema. Rect coords are rounded + clamped
 * since selections can carry fractional bounds.
 */
export function rasterizePolygonMask(
  path: Point[] | undefined,
  rect: Rect | undefined,
  w: number,
  h: number,
): Uint8Array {
  const mask = new Uint8Array(w * h)

  if (path && path.length >= 3) {
    // Standard even-odd scanline polygon fill. For each row, collect the x
    // of every edge crossing, sort, and fill between consecutive pairs.
    let minY = Infinity
    let maxY = -Infinity
    for (const p of path) {
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    const yStart = Math.max(0, Math.floor(minY))
    const yEnd = Math.min(h - 1, Math.ceil(maxY))
    const n = path.length
    for (let y = yStart; y <= yEnd; y++) {
      const yc = y + 0.5 // sample at pixel centre
      const xs: number[] = []
      for (let i = 0; i < n; i++) {
        const a = path[i]
        const b = path[(i + 1) % n]
        const y0 = a.y
        const y1 = b.y
        // Half-open: edge owns its lower endpoint, not its upper one.
        if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) {
          const t = (yc - y0) / (y1 - y0)
          xs.push(a.x + t * (b.x - a.x))
        }
      }
      xs.sort((p, q) => p - q)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xL = Math.max(0, Math.ceil(xs[k] - 0.5))
        const xR = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5))
        for (let x = xL; x <= xR; x++) mask[y * w + x] = 255
      }
    }
    return mask
  }

  if (rect) {
    const x0 = Math.max(0, Math.round(rect.x))
    const y0 = Math.max(0, Math.round(rect.y))
    const x1 = Math.min(w, Math.round(rect.x + rect.w))
    const y1 = Math.min(h, Math.round(rect.y + rect.h))
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) mask[y * w + x] = 255
    }
  }

  return mask
}

/**
 * Inflate a single-channel 0/255 mask into an RGBA buffer so it can be fed
 * to `extractMaskContour` (which reads RGBA luminance). Set cells become
 * opaque white, clear cells transparent black — luminance carries the shape.
 */
function maskToRGBA(mask: Uint8Array, w: number, h: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i]
    const j = i * 4
    rgba[j] = v
    rgba[j + 1] = v
    rgba[j + 2] = v
    rgba[j + 3] = 255
  }
  return rgba
}

/**
 * One separable box-blur pass over a 0..255 single-channel mask. Horizontal
 * then vertical, each averaging a `(2r+1)`-wide window. We use a scratch
 * buffer between passes (in-place separable blur corrupts the running sum),
 * and clamp the window at the edges by dividing by the actual sample count so
 * borders don't darken. Returns a new buffer.
 */
function boxBlurPass(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h)
  const out = new Uint8Array(w * h)
  // Horizontal.
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      let sum = 0
      let count = 0
      const lo = Math.max(0, x - r)
      const hi = Math.min(w - 1, x + r)
      for (let xx = lo; xx <= hi; xx++) {
        sum += src[row + xx]
        count++
      }
      tmp[row + x] = sum / count
    }
  }
  // Vertical.
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let sum = 0
      let count = 0
      const lo = Math.max(0, y - r)
      const hi = Math.min(h - 1, y + r)
      for (let yy = lo; yy <= hi; yy++) {
        sum += tmp[yy * w + x]
        count++
      }
      out[y * w + x] = sum / count
    }
  }
  return out
}

/**
 * Smooth — PS Select > Modify > Smooth. Rounds off jagged corners of a
 * selection polygon and erases protrusions / notches smaller than `radius`.
 *
 * Implementation is geometry-only (no image data): rasterize the polygon into
 * a binary mask, blur the mask by `radius` preview-pixels (a separable box
 * blur repeated 3× to approximate a Gaussian), threshold the blurred grey
 * mask back to binary at the contour threshold, then re-trace the boundary
 * with `extractMaskContour`. Corners come out rounded and sub-`radius`
 * features wash below the threshold and vanish — exactly PS behaviour.
 *
 * Returns null when `radius` is non-positive (no-op smoothing) or when the
 * re-traced polygon has fewer than 3 points (degenerate — caller should keep
 * the original selection).
 */
export function smoothSelection(
  path: Point[],
  radius: number,
  w: number,
  h: number,
): Point[] | null {
  if (!path || path.length < 3) return null
  const r = Math.max(1, Math.round(radius))
  if (radius <= 0) return null
  if (w <= 0 || h <= 0) return null

  let mask = rasterizePolygonMask(path, undefined, w, h)
  // 3 box-blur passes ≈ Gaussian (central-limit). Each pass widens the blur,
  // so the effective smoothing reach grows with `r`.
  for (let pass = 0; pass < 3; pass++) {
    mask = boxBlurPass(mask, w, h, r)
  }
  // Threshold back to binary at the same cutoff the tracer uses.
  for (let i = 0; i < mask.length; i++) {
    mask[i] = mask[i] >= CONTOUR_THRESHOLD ? 255 : 0
  }

  const rgba = maskToRGBA(mask, w, h)
  const contour = extractMaskContour(rgba, w, h)
  if (contour.length < 3) return null
  return contour
}

/** Max per-channel RGB delta between two pixels (indices into RGBA buffers).
 *  Mirrors PS magic-wand "tolerance" semantics, which gate on the largest
 *  single-channel difference rather than Euclidean distance. */
function maxChannelDist(data: Uint8ClampedArray, i: number, j: number): number {
  const dr = Math.abs(data[i] - data[j])
  const dg = Math.abs(data[i + 1] - data[j + 1])
  const db = Math.abs(data[i + 2] - data[j + 2])
  return Math.max(dr, dg, db)
}

/**
 * Grow — PS Select > Grow. Expands the current selection outward to
 * *contiguous* neighbouring pixels whose colour is close to an
 * already-selected neighbour. The contiguity is what separates this from
 * "Similar" (which grabs matching colours anywhere on the canvas).
 *
 * Algorithm: a 4-connected BFS flood that starts from the border of the
 * current selection. Seed the queue with every selected pixel that has at
 * least one unselected 4-neighbour (interior pixels can't grow, so skipping
 * them avoids scanning the whole region). Popping a pixel P, each unselected
 * neighbour N joins the grown set when `maxChannelDist(N, P) <= tolerance`,
 * and N is enqueued so growth can continue outward from it.
 *
 * Documented simplification: each candidate is compared to *its own selected
 * neighbour's* colour rather than to global seed-region colour statistics.
 * That keeps the pass simple and local, but means tolerance accumulates along
 * a path (each hop can drift by up to `tolerance`) — a smooth gradient will
 * grow further than a single global threshold would allow. This matches the
 * "region grow" feel and is the intended trade-off for v1.
 *
 * `currentMask` is a `w*h` `Uint8Array` (255 = selected). Returns the grown
 * region as a single polygon (`extractMaskContour`) plus its integer bbox, or
 * null if nothing grew / the trace is degenerate (< 3 points).
 */
export function growSelection(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  currentMask: Uint8Array,
  tolerance: number,
): { path: Point[]; bbox: Rect } | null {
  if (w <= 0 || h <= 0) return null
  const grown = currentMask.slice() // never mutate the caller's mask
  const total = w * h

  // Reference colour = mean RGB of the *original* selection. Candidates are
  // compared to this fixed reference (not the moving frontier) so the region
  // can't drift across an anti-aliased edge one sub-tolerance step at a time —
  // a frontier-only comparison bleeds the whole image on real photos. This
  // matches PS Grow's "adjacent pixels within tolerance *of the selection*".
  let sumR = 0
  let sumG = 0
  let sumB = 0
  let seedCount = 0
  for (let i = 0; i < total; i++) {
    if (currentMask[i] !== 255) continue
    const pi = i * 4
    sumR += data[pi]
    sumG += data[pi + 1]
    sumB += data[pi + 2]
    seedCount++
  }
  if (seedCount === 0) return null
  const refR = sumR / seedCount
  const refG = sumG / seedCount
  const refB = sumB / seedCount
  const withinRef = (idx4: number): boolean =>
    Math.abs(data[idx4] - refR) <= tolerance &&
    Math.abs(data[idx4 + 1] - refG) <= tolerance &&
    Math.abs(data[idx4 + 2] - refB) <= tolerance

  // BFS queue of pixel indices. Seed with border pixels of the selection.
  const queue: number[] = []
  const inSelection = (idx: number): boolean => grown[idx] === 255
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      if (currentMask[idx] !== 255) continue
      const hasFreeNeighbour =
        (x > 0 && currentMask[idx - 1] !== 255) ||
        (x < w - 1 && currentMask[idx + 1] !== 255) ||
        (y > 0 && currentMask[idx - w] !== 255) ||
        (y < h - 1 && currentMask[idx + w] !== 255)
      if (hasFreeNeighbour) queue.push(idx)
    }
  }
  if (queue.length === 0) return null // nothing to grow from

  let grew = false
  let head = 0
  while (head < queue.length) {
    const p = queue[head++]
    const px = p % w
    const py = (p / w) | 0
    const pi = p * 4
    // 4-connected neighbours.
    const neighbours: number[] = []
    if (px > 0) neighbours.push(p - 1)
    if (px < w - 1) neighbours.push(p + 1)
    if (py > 0) neighbours.push(p - w)
    if (py < h - 1) neighbours.push(p + w)
    for (const n of neighbours) {
      if (inSelection(n)) continue
      // Join when the candidate is within tolerance of EITHER the original
      // selection's colour (bounds drift) OR its already-selected neighbour
      // (lets a smooth same-object gradient still grow). The ref bound is what
      // stops the walk across a hard/anti-aliased boundary into the background.
      if (withinRef(n * 4) && maxChannelDist(data, n * 4, pi) <= tolerance) {
        grown[n] = 255
        grew = true
        queue.push(n)
      }
    }
  }
  if (!grew) return null

  // Compute bbox + trace the grown region in one final scan / pass.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < total; i++) {
    if (grown[i] !== 255) continue
    const x = i % w
    const y = (i / w) | 0
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  if (!isFinite(minX)) return null
  const bbox: Rect = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }

  const rgba = maskToRGBA(grown, w, h)
  const path = extractMaskContour(rgba, w, h)
  if (path.length < 3) return null
  return { path, bbox }
}
