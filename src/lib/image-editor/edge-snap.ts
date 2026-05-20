/**
 * Edge-snap helper for the Magnetic Lasso tool.
 *
 * Builds a Sobel-magnitude map of the canvas pixels at stroke start, then
 * each cursor sample finds the local maximum magnitude within a small
 * radius and snaps the point there. The result is a polygon that follows
 * high-contrast edges (object outlines) automatically.
 *
 * Implementation: the magnitude map is a Float32Array sized w * h with one
 * value per pixel. Built once per stroke from the canvas's current pixel
 * data. Each sample is O(radius²) — cheap for the small radii used here
 * (default 12px).
 */

export type EdgeMap = {
  mag: Float32Array
  w: number
  h: number
}

/**
 * Compute a Sobel-magnitude edge map from canvas pixels. Operates on the
 * luminance channel (Rec. 601 weighted) so colour transitions register as
 * edges even when the source has uniform brightness. Returns null when
 * the canvas is CORS-tainted (getImageData throws).
 */
export function buildEdgeMap(canvas: HTMLCanvasElement): EdgeMap | null {
  const w = canvas.width
  const h = canvas.height
  if (w < 3 || h < 3) return null
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  let data: ImageData
  try {
    data = ctx.getImageData(0, 0, w, h)
  } catch {
    return null
  }
  const lum = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    lum[i] = (data.data[o] * 299 + data.data[o + 1] * 587 + data.data[o + 2] * 114) / 1000
  }
  const mag = new Float32Array(w * h)
  // Sobel:  Gx = [-1 0 1; -2 0 2; -1 0 1]; Gy = transpose.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const tl = lum[i - w - 1], t = lum[i - w], tr = lum[i - w + 1]
      const l = lum[i - 1], r = lum[i + 1]
      const bl = lum[i + w - 1], b = lum[i + w], br = lum[i + w + 1]
      const gx = -tl - 2 * l - bl + tr + 2 * r + br
      const gy = -tl - 2 * t - tr + bl + 2 * b + br
      mag[i] = Math.sqrt(gx * gx + gy * gy)
    }
  }
  return { mag, w, h }
}

/**
 * Snap `(cx, cy)` to the nearest pixel with the highest edge magnitude
 * within `radius`. Returns the snapped coords; falls back to the input
 * when no pixel in range has nonzero magnitude (flat region).
 */
export function snapToEdge(
  map: EdgeMap,
  cx: number,
  cy: number,
  radius: number,
): { x: number; y: number } {
  const r = Math.max(1, Math.floor(radius))
  const x0 = Math.max(0, Math.floor(cx) - r)
  const y0 = Math.max(0, Math.floor(cy) - r)
  const x1 = Math.min(map.w - 1, Math.floor(cx) + r)
  const y1 = Math.min(map.h - 1, Math.floor(cy) + r)
  let bestX = cx, bestY = cy, bestMag = 0
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const m = map.mag[y * map.w + x]
      if (m > bestMag) {
        bestMag = m
        bestX = x
        bestY = y
      }
    }
  }
  // Threshold — under this just return the cursor (no real edge nearby).
  if (bestMag < 30) return { x: cx, y: cy }
  return { x: bestX, y: bestY }
}
