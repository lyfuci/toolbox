import type { Point, Rect } from './types'
import { extractMaskContour } from './mask-contour'

/**
 * Heuristic "Select Subject" — a classical computer-vision approximation of
 * Photoshop's Select > Subject, with NO machine-learning model and NO network
 * round-trip. It runs entirely on the CPU in a handful of O(w*h) passes, so it
 * is fast enough to invoke synchronously on a preview-resolution buffer.
 *
 * This is a SALIENCY-BASED HEURISTIC, not a matting model. It works well on
 * photos with a single, reasonably central foreground subject sitting against
 * a contrasting, relatively uniform background (product shots, portraits on
 * plain backdrops, etc.). It will struggle with busy backgrounds, low-contrast
 * subjects, subjects that touch the frame edge heavily, or multiple competing
 * subjects. Callers should label it honestly and fall back gracefully (toast
 * "couldn't detect a subject") when it returns null.
 *
 * The pipeline:
 *   1. Build a per-pixel saliency map (0..255) combining background-colour
 *      contrast, a central radial bias, and Sobel edge energy.
 *   2. Threshold the saliency with Otsu's method into a binary mask.
 *   3. Morphological cleanup: closing then opening with a 3×3 element.
 *   4. Keep only the largest connected component.
 *   5. Flood-fill interior holes (anything the background flood can't reach).
 *   6. Trace the kept mask's outer contour into a polygon and compute its bbox.
 */

/**
 * Run the heuristic subject extraction on an RGBA pixel buffer at preview
 * resolution. Returns a polygon (in the same preview-pixel space as the input)
 * plus its bounding rect, or null when the heuristic fails — which we define
 * as the detected subject covering essentially the whole frame (>97%) or
 * essentially nothing (<0.3%). In those degenerate cases the result is
 * meaningless and the caller should tell the user no subject was found.
 */
export function selectSubject(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): { path: Point[]; bbox: Rect } | null {
  if (w <= 0 || h <= 0 || data.length < w * h * 4) return null

  const saliency = buildSaliency(data, w, h)
  const threshold = otsu(saliency)

  // Binary mask as a flat Uint8Array (0/1) — every downstream stage operates
  // on this compact representation for speed; we only inflate to RGBA at the
  // very end for the contour tracer.
  const n = w * h
  let mask: Uint8Array = new Uint8Array(n)
  for (let i = 0; i < n; i++) mask[i] = saliency[i] > threshold ? 1 : 0

  // Closing (dilate→erode) removes small background speckles and bridges
  // narrow gaps; opening (erode→dilate) then strips thin foreground noise.
  mask = dilate(mask, w, h)
  mask = erode(mask, w, h)
  mask = erode(mask, w, h)
  mask = dilate(mask, w, h)

  // Keep the single biggest blob — discards stray flecks the morphology left
  // behind and disjoint background regions that crossed the threshold.
  mask = largestComponent(mask, w, h)

  // Fill holes so a subject with bright interior detail (eyes, logos, sky
  // showing through) becomes a solid silhouette rather than a ring.
  fillHoles(mask, w, h)

  // Degenerate-case guard on the MASK area (cheap, and meaningful before we
  // bother tracing a contour). Near-empty or near-full → heuristic failed.
  let area = 0
  for (let i = 0; i < n; i++) area += mask[i]
  const frac = area / n
  if (frac < 0.003 || frac > 0.97) return null

  // Inflate the binary mask into an RGBA white-on-black buffer purely so we
  // can reuse the shared Moore-tracer. No DOM ImageData — just a typed array.
  const rgba = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i++) {
    const v = mask[i] ? 255 : 0
    const j = i * 4
    rgba[j] = v
    rgba[j + 1] = v
    rgba[j + 2] = v
    rgba[j + 3] = 255
  }

  const path = extractMaskContour(rgba, w, h, { maxPoints: 600 })
  if (path.length < 3) return null

  // bbox from the polygon — single source of truth; for an outer contour this
  // equals the mask's bbox anyway.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of path) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  const bbox: Rect = { x: minX, y: minY, w: maxX - minX, h: maxY - minY }

  return { path, bbox }
}

/**
 * Combine three saliency cues into a normalised 0..255 map.
 *
 * - **Background contrast**: we estimate the background colour by averaging
 *   the image's 1-px border ring (subjects rarely fill the very edge), then
 *   score each pixel by its Euclidean RGB distance from that mean. Pixels far
 *   from the background colour are likely foreground.
 * - **Centre bias**: a Gaussian radial falloff from the image centre. Subjects
 *   tend to be central; this suppresses background patches near the edges that
 *   happen to differ in colour.
 * - **Edge energy**: Sobel gradient magnitude on luminance, favouring
 *   structured/textured regions over flat ones.
 *
 * The three cues are combined MULTIPLICATIVELY (contrast × edge-boosted) and
 * gated by the centre bias, so a pixel must be *both* unlike the background and
 * reasonably central to score high — additive combination would let a
 * strongly-central but background-coloured pixel leak in.
 */
function buildSaliency(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const n = w * h

  // ── Background colour estimate from the border ring ──────────────────────
  let br = 0
  let bg = 0
  let bb = 0
  let count = 0
  const sampleRow = (y: number) => {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      br += data[i]
      bg += data[i + 1]
      bb += data[i + 2]
      count++
    }
  }
  const sampleCol = (x: number) => {
    for (let y = 1; y < h - 1; y++) {
      const i = (y * w + x) * 4
      br += data[i]
      bg += data[i + 1]
      bb += data[i + 2]
      count++
    }
  }
  sampleRow(0)
  if (h > 1) sampleRow(h - 1)
  sampleCol(0)
  if (w > 1) sampleCol(w - 1)
  br /= count
  bg /= count
  bb /= count

  // ── Edge energy (Sobel magnitude on luminance) ───────────────────────────
  const edge = sobel(data, w, h)

  // ── Centre-bias parameters ────────────────────────────────────────────────
  const cx = (w - 1) / 2
  const cy = (h - 1) / 2
  // σ ≈ half the shorter side: the falloff reaches ~0.6 near the frame edge on
  // the short axis, so central pixels dominate without fully zeroing the rim.
  const sigma = Math.max(1, Math.min(w, h) / 2)
  const twoSigmaSq = 2 * sigma * sigma

  const out = new Float32Array(n)
  let max = 0
  // Max possible RGB distance for normalisation (black↔white corner).
  const maxDist = Math.sqrt(3 * 255 * 255)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      const i = idx * 4
      const dr = data[i] - br
      const dg = data[i + 1] - bg
      const db = data[i + 2] - bb
      const contrast = Math.sqrt(dr * dr + dg * dg + db * db) / maxDist // 0..1

      const ddx = x - cx
      const ddy = y - cy
      const center = Math.exp(-(ddx * ddx + ddy * ddy) / twoSigmaSq) // 0..1

      // Edge boost: 1 + normalised edge energy, so a flat-but-distinct region
      // still scores on contrast alone, while textured edges get amplified.
      const edgeBoost = 1 + edge[idx]

      const s = contrast * edgeBoost * center
      out[idx] = s
      if (s > max) max = s
    }
  }

  // Normalise to 0..255.
  const norm = new Float32Array(n)
  if (max > 0) {
    const scale = 255 / max
    for (let i = 0; i < n; i++) norm[i] = out[i] * scale
  }
  return norm
}

/**
 * Sobel gradient magnitude on the luminance channel, returned normalised to
 * 0..1. The 1-px border is left at 0 rather than sampling out of bounds — the
 * border ring is background anyway, so zeroing it is harmless and avoids edge
 * artefacts. Output length is w*h (one value per pixel).
 */
function sobel(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const n = w * h
  const lum = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const j = i * 4
    // Rec. 601 luma — cheap and adequate for edge detection.
    lum[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]
  }

  const mag = new Float32Array(n)
  let max = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const o = y * w + x
      const tl = lum[o - w - 1]
      const tc = lum[o - w]
      const tr = lum[o - w + 1]
      const ml = lum[o - 1]
      const mr = lum[o + 1]
      const bl = lum[o + w - 1]
      const bc = lum[o + w]
      const brr = lum[o + w + 1]
      const gx = tr + 2 * mr + brr - tl - 2 * ml - bl
      const gy = bl + 2 * bc + brr - tl - 2 * tc - tr
      const m = Math.sqrt(gx * gx + gy * gy)
      mag[o] = m
      if (m > max) max = m
    }
  }
  if (max > 0) {
    for (let i = 0; i < n; i++) mag[i] /= max
  }
  return mag
}

/**
 * Otsu's method: pick the 0..255 threshold that maximises between-class
 * variance of the histogram. Chosen over a fixed cut or mean+k·σ because the
 * saliency map's distribution varies wildly between images — Otsu adapts to
 * whatever bimodal-ish split the foreground/background produced without a
 * hand-tuned constant. Returns the threshold; callers keep pixels strictly
 * above it.
 */
function otsu(values: Float32Array): number {
  const hist = new Int32Array(256)
  const n = values.length
  for (let i = 0; i < n; i++) {
    let v = values[i] | 0
    if (v < 0) v = 0
    else if (v > 255) v = 255
    hist[v]++
  }

  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]

  let sumB = 0
  let wB = 0
  let maxVar = -1
  let threshold = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = n - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > maxVar) {
      maxVar = between
      threshold = t
    }
  }
  return threshold
}

/**
 * Binary dilation with a 3×3 (8-connected) structuring element: a pixel
 * becomes 1 if any of its 8 neighbours (or itself) is 1. Grows the foreground,
 * filling pinholes and bridging small gaps. Returns a new array; input is left
 * untouched.
 */
function dilate(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * w + x
      if (mask[o]) {
        out[o] = 1
        continue
      }
      let hit = 0
      for (let dy = -1; dy <= 1 && !hit; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= w) continue
          if (mask[ny * w + nx]) {
            hit = 1
            break
          }
        }
      }
      out[o] = hit
    }
  }
  return out
}

/**
 * Binary erosion with a 3×3 (8-connected) structuring element: a pixel stays 1
 * only if all 8 neighbours that exist are also 1 (out-of-bounds neighbours are
 * treated as background, so erosion nibbles the frame edge — acceptable, the
 * subject shouldn't hug the edge). Shrinks the foreground, removing thin
 * protrusions and isolated specks. Returns a new array.
 */
function erode(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * w + x
      if (!mask[o]) {
        out[o] = 0
        continue
      }
      let keep = 1
      for (let dy = -1; dy <= 1 && keep; dy++) {
        const ny = y + dy
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= w || ny < 0 || ny >= h || !mask[ny * w + nx]) {
            keep = 0
            break
          }
        }
      }
      out[o] = keep
    }
  }
  return out
}

/**
 * Keep only the largest 4-connected foreground blob, zeroing everything else.
 * Uses an iterative (queue-based) flood fill — a recursive variant would blow
 * the JS stack on a megapixel preview. Returns a new array.
 */
function largestComponent(mask: Uint8Array, w: number, h: number): Uint8Array {
  const n = w * h
  const label = new Int32Array(n).fill(0) // 0 = unvisited/background
  const queue = new Int32Array(n)
  let bestLabel = 0
  let bestSize = 0
  let current = 0

  for (let start = 0; start < n; start++) {
    if (!mask[start] || label[start] !== 0) continue
    current++
    let head = 0
    let tail = 0
    queue[tail++] = start
    label[start] = current
    let size = 0
    while (head < tail) {
      const p = queue[head++]
      size++
      const px = p % w
      const py = (p / w) | 0
      // 4-neighbourhood.
      if (px > 0) {
        const q = p - 1
        if (mask[q] && label[q] === 0) {
          label[q] = current
          queue[tail++] = q
        }
      }
      if (px < w - 1) {
        const q = p + 1
        if (mask[q] && label[q] === 0) {
          label[q] = current
          queue[tail++] = q
        }
      }
      if (py > 0) {
        const q = p - w
        if (mask[q] && label[q] === 0) {
          label[q] = current
          queue[tail++] = q
        }
      }
      if (py < h - 1) {
        const q = p + w
        if (mask[q] && label[q] === 0) {
          label[q] = current
          queue[tail++] = q
        }
      }
    }
    if (size > bestSize) {
      bestSize = size
      bestLabel = current
    }
  }

  const out = new Uint8Array(n)
  if (bestLabel === 0) return out
  for (let i = 0; i < n; i++) out[i] = label[i] === bestLabel ? 1 : 0
  return out
}

/**
 * Fill interior holes in the foreground mask, IN PLACE. Strategy: flood-fill
 * the *background* (0-pixels) starting from every border cell using a 4-
 * connected iterative queue. Any background pixel the flood never reaches is
 * enclosed by foreground — a hole — so we set it to 1. This solidifies the
 * subject silhouette without affecting its outer shape.
 */
function fillHoles(mask: Uint8Array, w: number, h: number): void {
  const n = w * h
  const reached = new Uint8Array(n) // background pixels reachable from border
  const queue = new Int32Array(n)
  let head = 0
  let tail = 0

  const push = (i: number) => {
    if (!mask[i] && !reached[i]) {
      reached[i] = 1
      queue[tail++] = i
    }
  }

  // Seed from the entire border ring.
  for (let x = 0; x < w; x++) {
    push(x) // top row
    push((h - 1) * w + x) // bottom row
  }
  for (let y = 0; y < h; y++) {
    push(y * w) // left col
    push(y * w + (w - 1)) // right col
  }

  while (head < tail) {
    const p = queue[head++]
    const px = p % w
    const py = (p / w) | 0
    if (px > 0) push(p - 1)
    if (px < w - 1) push(p + 1)
    if (py > 0) push(p - w)
    if (py < h - 1) push(p + w)
  }

  // Background pixels NOT reached are enclosed holes → make them foreground.
  for (let i = 0; i < n; i++) {
    if (!mask[i] && !reached[i]) mask[i] = 1
  }
}
