import type { Point, Rect } from './types'
import { extractMaskContour } from './mask-contour'

/**
 * Color Range selection (PS: Select > Color Range).
 *
 * IMPORTANT — single-connected-region approximation. Photoshop's Color Range
 * selects every pixel within tolerance of the sampled colour *globally* and
 * non-contiguously (one click on a red shirt also selects a red apple across
 * the frame). Our selection model is a single polygon (`selectionPath` is a
 * flat `Point[]`, see EditorState), which cannot represent multiple disjoint
 * islands. So after computing the global colour mask we keep only the LARGEST
 * connected component and trace a single contour around it. The total region
 * count is surfaced so the UI can warn ("selected largest of N regions") when
 * the colour spans multiple blobs.
 *
 * All functions operate on raw RGBA buffers (`Uint8ClampedArray`, length
 * `w*h*4`) and emit geometry in the same pixel space as the input buffer —
 * the editor passes preview-resolution pixels and consumes preview-pixel
 * polygons, so there's no extra coordinate mapping here. No DOM canvas is
 * touched, which keeps the algorithm node-testable.
 */

/**
 * Build a binary colour-membership mask: 255 where the pixel is within range
 * of `sample`, else 0.
 *
 * Membership uses plain Euclidean RGB distance against a threshold derived
 * from `fuzziness`. PS treats fuzziness as a *soft* tolerance with a falloff
 * (producing a greyscale selection); for v1 we deliberately simplify to a
 * hard cut — `dist <= fuzziness` — because the downstream selection model is a
 * binary polygon anyway, so partial selection would be discarded. `fuzziness`
 * is interpreted directly as a distance in RGB units (0..200 ≈ a sensible
 * slice of the 0..~441 max RGB distance).
 *
 * Fully-transparent pixels (alpha 0) are never selected — they carry no
 * meaningful colour and including them would bleed the selection into padding.
 */
export function colorRangeMask(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  sample: { r: number; g: number; b: number },
  fuzziness: number,
): Uint8Array {
  const mask = new Uint8Array(w * h)
  // Compare squared distances to avoid a sqrt per pixel.
  const thresholdSq = fuzziness * fuzziness
  const n = w * h
  for (let p = 0; p < n; p++) {
    const i = p * 4
    if (data[i + 3] === 0) continue // transparent → unselected
    const dr = data[i] - sample.r
    const dg = data[i + 1] - sample.g
    const db = data[i + 2] - sample.b
    const distSq = dr * dr + dg * dg + db * db
    if (distSq <= thresholdSq) mask[p] = 255
  }
  return mask
}

/**
 * Reduce a binary mask to its single largest 4-connected component.
 *
 * Returns a fresh mask containing only the biggest blob, plus `regionCount` —
 * the total number of distinct connected regions found in the input. The
 * caller uses the count to decide whether to warn the user that the colour
 * spanned several disjoint areas and only one survived (the selection model
 * holds a single polygon).
 *
 * Uses an iterative flood fill (explicit stack) rather than recursion: a
 * preview can be ~100k pixels, which would overflow the JS call stack with a
 * recursive DFS.
 */
export function largestComponentMask(
  mask: Uint8Array,
  w: number,
  h: number,
): { mask: Uint8Array; regionCount: number } {
  const n = w * h
  // Component id per pixel; 0 = background / unvisited foreground sentinel.
  const labels = new Int32Array(n)
  const stack: number[] = []
  let regionCount = 0
  let bestLabel = 0
  let bestSize = 0

  for (let start = 0; start < n; start++) {
    if (mask[start] === 0 || labels[start] !== 0) continue
    regionCount++
    const label = regionCount
    let size = 0
    stack.push(start)
    labels[start] = label
    while (stack.length > 0) {
      const p = stack.pop() as number
      size++
      const x = p % w
      const y = (p - x) / w
      // 4-neighbourhood.
      if (x > 0) {
        const q = p - 1
        if (mask[q] !== 0 && labels[q] === 0) {
          labels[q] = label
          stack.push(q)
        }
      }
      if (x < w - 1) {
        const q = p + 1
        if (mask[q] !== 0 && labels[q] === 0) {
          labels[q] = label
          stack.push(q)
        }
      }
      if (y > 0) {
        const q = p - w
        if (mask[q] !== 0 && labels[q] === 0) {
          labels[q] = label
          stack.push(q)
        }
      }
      if (y < h - 1) {
        const q = p + w
        if (mask[q] !== 0 && labels[q] === 0) {
          labels[q] = label
          stack.push(q)
        }
      }
    }
    if (size > bestSize) {
      bestSize = size
      bestLabel = label
    }
  }

  const out = new Uint8Array(n)
  if (bestLabel !== 0) {
    for (let p = 0; p < n; p++) {
      if (labels[p] === bestLabel) out[p] = 255
    }
  }
  return { mask: out, regionCount }
}

/**
 * Full Color Range pipeline: sample colour → membership mask → keep largest
 * connected component → trace a single outline polygon.
 *
 * Returns the selection `path` (preview-pixel polygon), its `bbox` (computed
 * from the kept *mask pixels*, not the downsampled contour — the contour caps
 * at maxPoints and would underestimate the true span), and `regionCount` so
 * the UI can toast "selected largest of N regions".
 *
 * Returns `null` when nothing qualifies: empty mask (regionCount 0), or a
 * traced contour with fewer than 3 points (a 0/1-pixel region can't form a
 * usable polygon).
 */
export function colorRangeSelection(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  sample: { r: number; g: number; b: number },
  fuzziness: number,
): { path: Point[]; bbox: Rect; regionCount: number } | null {
  const raw = colorRangeMask(data, w, h, sample, fuzziness)
  const { mask, regionCount } = largestComponentMask(raw, w, h)
  if (regionCount === 0) return null

  // Bbox from the kept mask pixels.
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let p = 0; p < w * h; p++) {
    if (mask[p] === 0) continue
    const x = p % w
    const y = (p - x) / w
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  if (maxX < 0) return null
  const bbox: Rect = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }

  // extractMaskContour wants an RGBA buffer (luminance > threshold = set).
  const rgba = new Uint8ClampedArray(w * h * 4)
  for (let p = 0; p < w * h; p++) {
    if (mask[p] === 0) continue
    const i = p * 4
    rgba[i] = 255
    rgba[i + 1] = 255
    rgba[i + 2] = 255
    rgba[i + 3] = 255
  }
  const path = extractMaskContour(rgba, w, h, { maxPoints: 500 })
  if (path.length < 3) return null

  return { path, bbox, regionCount }
}
