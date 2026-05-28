import type { SurfaceBlurParams } from './types'
/**
 * Surface Blur — an edge-preserving (bilateral-style) blur that mirrors
 * Photoshop's Filter → Blur → Surface Blur. Spatial filter → shared FILTER
 * signature, mutates `data` in place.
 *
 * WHY this is NOT a plain box/Gaussian blur: an ordinary blur averages every
 * neighbour equally, so it smears edges and detail along with noise. Surface
 * Blur adds a *range* term: a neighbour only contributes if its value is close
 * enough to the centre pixel. Flat regions (skin, sky, paper) — where all
 * neighbours sit within `threshold` of the centre — get fully averaged and so
 * are smoothed. But across a real edge the two sides differ by far more than
 * `threshold`, so the far side is excluded and the centre keeps (nearly) its
 * own value. Net effect: noise/banding melt away while edges stay crisp.
 *
 * Range weight — HARD CUTOFF: a neighbour whose absolute per-channel
 * difference from the centre is `> threshold` contributes 0; otherwise it
 * contributes 1 (a flat, unweighted mean of the qualifying samples). A hard
 * cutoff is the simplest and most predictable choice — it makes the
 * edge-preservation guarantee exact (a black|white border with the default
 * threshold 25 can never blend, since |255 − 0| = 255 ≫ 25) rather than merely
 * "mostly" preserved as a soft linear falloff would. PS itself uses a soft
 * tent weight, but for a node-testable filter a clean cutoff is the better fit.
 *
 * PER-CHANNEL: the difference test and the averaging are done independently for
 * R, G and B. A neighbour can qualify for the red channel but be rejected for
 * blue. This matches PS (it treats channels separately) and avoids cross-channel
 * colour bleeding on coloured edges. Alpha is left untouched.
 *
 * WHY `radius` IS a pixel-radius (bake-scale flag): the averaging window is
 * literally (2·radius + 1) pixels wide. An 8px surface blur on the small
 * preview buffer is a weaker, finer operation than an 8px blur on the full-res
 * export, so this field MUST be scaled by the renderer's `scaleFilterParams`
 * for the export to match the preview. `threshold` is a value-space tolerance
 * (0..255 colour distance), NOT spatial — it must NOT be scaled.
 *
 * Borders: the window is clamped to the image bounds; we simply gather whatever
 * in-bounds samples exist, so edge pixels need no special pass.
 *
 * Cost: a direct (2r+1)² window. For the typical radii here (≤ ~25) this is a
 * few hundred to a couple thousand samples per pixel — fine for a one-shot
 * filter pass. A separable approximation is NOT valid for a bilateral filter
 * (the range weight is not separable), so we keep the honest 2D window.
 */

export const DEFAULT_SURFACE_BLUR: SurfaceBlurParams = {
  kind: 'surfaceBlur',
  radius: 8,
  threshold: 25,
}

export function applySurfaceBlur(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: SurfaceBlurParams,
): void {
  if (width === 0 || height === 0) return

  // radius 0 → 1×1 window → identity. We deliberately do NOT floor it up to 1
  // (unlike the median filter): the contract is that radius 0 is a no-op.
  const r = Math.max(0, Math.round(params.radius))
  if (r === 0) return

  // Clamp threshold into the meaningful 0..255 value range. A threshold ≥ 255
  // admits every neighbour → degenerates to a plain box blur (intended).
  const thr = Math.max(0, Math.min(255, Math.round(params.threshold)))

  // Read from an immutable snapshot so already-written output pixels don't
  // contaminate the neighbourhoods of pixels processed later in the pass.
  const src = new Uint8ClampedArray(data)

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(height - 1, y + r)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(width - 1, x + r)
      const ci = (y * width + x) * 4

      const cr = src[ci]
      const cg = src[ci + 1]
      const cb = src[ci + 2]

      // Per-channel accumulators: sum of qualifying samples + their count.
      let sumR = 0
      let cntR = 0
      let sumG = 0
      let cntG = 0
      let sumB = 0
      let cntB = 0

      for (let yy = y0; yy <= y1; yy++) {
        const row = yy * width
        for (let xx = x0; xx <= x1; xx++) {
          const ni = (row + xx) * 4
          const nr = src[ni]
          const ng = src[ni + 1]
          const nb = src[ni + 2]

          // Hard cutoff per channel: |Δ| ≤ thr ⇒ include, else skip entirely.
          if (nr >= cr - thr && nr <= cr + thr) {
            sumR += nr
            cntR++
          }
          if (ng >= cg - thr && ng <= cg + thr) {
            sumG += ng
            cntG++
          }
          if (nb >= cb - thr && nb <= cb + thr) {
            sumB += nb
            cntB++
          }
        }
      }

      // cnt is always ≥ 1 (the centre pixel qualifies for itself), so no /0.
      data[ci] = sumR / cntR
      data[ci + 1] = sumG / cntG
      data[ci + 2] = sumB / cntB
      // Alpha (ci+3) intentionally left as the original.
    }
  }
}
