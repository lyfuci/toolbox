/**
 * Wind — the classic "speed streak" Stylize filter (Photoshop Filter →
 * Stylize → Wind). Spatial filter → shared FILTER signature, mutates `data` in
 * place. Only HORIZONTAL streaking (PS Wind is row-wise; vertical wind is done
 * by rotating the image, which the editor handles separately).
 *
 * WHAT it does: it finds vertical edges within each row and smears the
 * BRIGHTER side's colour horizontally in the wind `direction`, over a short,
 * randomised streak. The result is the familiar look of pixels being "blown"
 * off edges — bright detail trails into the darker neighbouring region like
 * motion blur, but only emanating from edges (flat areas stay put).
 *
 * APPROACH — edge-detect + directional bleed:
 *   1. Work per row, reading from an immutable snapshot of the row so streaks
 *      we paint don't feed back into later edge detection in the same row.
 *   2. Scan adjacent horizontal pairs. The "source" of a streak is the pixel
 *      on the BRIGHTER side of a strong luminance edge; the streak is painted
 *      into the DARKER side, in the wind direction.
 *        • direction 'right': we look for edges where the LEFT pixel is much
 *          brighter than the right (bright→dark going rightward); the bright
 *          colour bleeds rightward into the dark region.
 *        • direction 'left': mirror image — the RIGHT pixel is the brighter
 *          source and bleeds leftward.
 *   3. The streak length is a random draw scaled by `strength`, with falloff:
 *      the source colour is blended over the underlying pixels with a weight
 *      that decays along the streak, so trails fade out naturally instead of
 *      ending in a hard block.
 *
 * WHY a SEEDED PRNG (determinism): `WindParams` carries no seed, but the editor
 * re-renders preview and export from the same params and expects identical
 * output. Using `Math.random()` would reshuffle every redraw and the export
 * wouldn't match the preview. We therefore derive a deterministic per-row seed
 * from a fixed constant + the row index, so the jitter is varied between rows
 * (avoids an obvious repeating comb pattern) yet byte-stable across runs on the
 * same input. Identical input + params ⇒ identical output, every time.
 *
 * WHY `strength` IS spatial (bake-scale flag): it scales the streak LENGTH in
 * pixels. A 30-unit streak on a small preview thumbnail covers a far larger
 * fraction of the image than the same 30 units on the full-res export, so for
 * the export to match the preview this field MUST be scaled by the renderer's
 * `scaleFilterParams` (treat it as a pixel-length scale, like a radius).
 * `direction` is categorical and is never scaled.
 *
 * Edge cases: strength ≤ 0 → max streak length 0 → identity. A flat field has
 * no edges over the detection threshold → identity. Alpha is left untouched.
 */

export type WindParams = {
  kind: 'wind'
  direction: 'left' | 'right'
  /** 1..100 streak-length scale (pixels-ish; bake-scaled). Default 30. */
  strength: number
}

export const DEFAULT_WIND: WindParams = {
  kind: 'wind',
  direction: 'right',
  strength: 30,
}

/**
 * Mulberry32 — tiny seeded PRNG, floats in [0, 1). Inlined so this filter file
 * is self-contained. Good-enough distribution for streak jitter; not crypto.
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Rec. 601 luma; we detect edges on perceived brightness, not a raw channel. */
function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

export function applyWind(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: WindParams,
): void {
  if (width === 0 || height === 0) return

  // strength ≤ 0 → no streaks → identity. Clamp into the documented 1..100.
  const strength = Math.max(0, Math.min(100, Math.round(params.strength)))
  if (strength === 0) return

  // Map strength 1..100 → a max streak length in pixels. The factor keeps the
  // default (30) producing a visible-but-not-overwhelming ~15px max trail.
  const maxLen = Math.max(1, Math.round((strength / 100) * 50))

  // Brightness gap (in luma) that counts as a streakable edge. Below this we
  // treat the transition as flat texture and leave it alone — this is what
  // makes a noise-free flat field an exact identity.
  const EDGE_THRESHOLD = 24

  const dir = params.direction === 'left' ? -1 : 1

  // Fixed base seed (golden-ratio constant) so output is deterministic. Per-row
  // seeding (base XOR row index) decorrelates streak lengths between rows.
  const BASE_SEED = 0x9e3779b9

  for (let y = 0; y < height; y++) {
    // Snapshot just this row's RGBA. Edge detection and the source colour both
    // read the ORIGINAL row; streaks are written into the live `data`, so a
    // streak never becomes the source of another streak in the same row.
    const rowOff = y * width * 4
    const rowSrc = data.slice(rowOff, rowOff + width * 4)
    const rng = mulberry32((BASE_SEED ^ Math.imul(y + 1, 0x85ebca6b)) >>> 0)

    for (let x = 0; x < width; x++) {
      // Compare this pixel with its neighbour on the UPWIND side, i.e. the
      // neighbour the streak would flow away from. For wind 'right' the streak
      // flows rightward, so the brighter source sits to the LEFT: compare x
      // with x-1. For 'left' it sits to the RIGHT: compare x with x+1.
      const srcX = x - dir // upwind neighbour (the potential bright source)
      if (srcX < 0 || srcX >= width) continue

      const si = srcX * 4
      const ci = x * 4
      const srcLuma = luma(rowSrc[si], rowSrc[si + 1], rowSrc[si + 2])
      const curLuma = luma(rowSrc[ci], rowSrc[ci + 1], rowSrc[ci + 2])

      // Streak only where the upwind neighbour is BRIGHTER than here by more
      // than the threshold — i.e. we are stepping bright→dark in the wind
      // direction, the configuration that produces a visible light trail.
      const gap = srcLuma - curLuma
      if (gap <= EDGE_THRESHOLD) continue

      // The source colour we bleed downwind is the bright upwind pixel.
      const sr = rowSrc[si]
      const sg = rowSrc[si + 1]
      const sb = rowSrc[si + 2]

      // Randomised streak length, biased by how strong the edge is: stronger
      // edges (relative to 255) throw longer streaks, matching PS's behaviour
      // of "more wind off harder edges". rng() jitters it for a natural,
      // non-uniform comb. At least 1px so an edge always leaves a mark.
      const edgeScale = Math.min(1, gap / 255)
      const len = 1 + Math.floor(rng() * maxLen * (0.4 + 0.6 * edgeScale))

      // Paint downwind from x, blending the source colour over the existing
      // pixels with a weight that decays along the streak (1 at the head → ~0
      // at the tail) for a soft motion-blur fade.
      for (let k = 0; k < len; k++) {
        const px = x + dir * k
        if (px < 0 || px >= width) break
        const pi = rowOff + px * 4
        // Linear falloff over the streak length.
        const w = 1 - k / len
        data[pi] = data[pi] + (sr - data[pi]) * w
        data[pi + 1] = data[pi + 1] + (sg - data[pi + 1]) * w
        data[pi + 2] = data[pi + 2] + (sb - data[pi + 2]) * w
        // Alpha untouched.
      }
    }
  }
}
