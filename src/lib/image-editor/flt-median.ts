/**
 * Median — replace each pixel channel with the median of its (2r+1)² square
 * neighbourhood, per channel (R, G, B independently; alpha left untouched).
 * Spatial filter → shared FILTER signature, mutates `data` in place.
 *
 * WHY median (not a mean/blur): the median is a rank-order statistic, so a
 * lone bright or dark speckle (salt-and-pepper / impulse noise) is rejected
 * outright instead of being smeared into its neighbours. Crucially, on a clean
 * step edge the median still picks one of the two real values present in the
 * window, so edges stay crisp — the classic edge-preserving denoiser.
 *
 * WHY radius IS a pixel-radius: the window is literally (2·radius+1) pixels
 * wide. A 2px median on the small preview buffer is a *different, weaker*
 * operation than a 2px median on the full-res export, so this field MUST be
 * bake-scale scaled by the renderer (`scaleFilterParams`) — flag for wiring.
 *
 * Borders: the window is clamped to the image bounds (we just gather however
 * many in-bounds samples exist and take their median), so edge pixels are
 * handled without a special pass.
 *
 * Cost: for radius ≤ 10 the window is at most 21² = 441 samples. We read the
 * window into a scratch array and insertion-sort it per channel — simple,
 * branch-light, and plenty fast for these radii. No histogram needed.
 */

export type MedianParams = {
  kind: 'median'
  /** 1..10 px. Window half-width; window is (2·radius+1)² pixels. */
  radius: number
}

export const DEFAULT_MEDIAN: MedianParams = { kind: 'median', radius: 2 }

export function applyMedian(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: MedianParams,
): void {
  const r = Math.max(1, Math.min(10, Math.round(params.radius)))
  if (width === 0 || height === 0) return

  // Read from an immutable snapshot so already-written output pixels don't
  // contaminate windows of pixels processed later.
  const src = new Uint8ClampedArray(data)
  const win = (2 * r + 1) * (2 * r + 1)
  // One scratch buffer per channel reused across pixels.
  const buf = new Uint8ClampedArray(win)

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(height - 1, y + r)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(width - 1, x + r)
      const i = (y * width + x) * 4

      for (let c = 0; c < 3; c++) {
        let n = 0
        for (let yy = y0; yy <= y1; yy++) {
          const row = yy * width
          for (let xx = x0; xx <= x1; xx++) {
            buf[n++] = src[(row + xx) * 4 + c]
          }
        }
        // Insertion sort the n in-bounds samples, then take the middle one.
        for (let j = 1; j < n; j++) {
          const v = buf[j]
          let k = j - 1
          while (k >= 0 && buf[k] > v) {
            buf[k + 1] = buf[k]
            k--
          }
          buf[k + 1] = v
        }
        data[i + c] = buf[n >> 1]
      }
      // Alpha (i+3) intentionally left as the original.
    }
  }
}
