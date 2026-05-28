import type { OilPaintParams } from './types'
/**
 * Oil Paint — painterly posterization via the classic intensity-histogram
 * method (Photoshop's Filter → Stylize → Oil Paint). Spatial filter → shared
 * FILTER signature, mutates `data` in place.
 *
 * THE METHOD — most-populous intensity bin: for each pixel we scan its
 * (2·radius+1)² neighbourhood and bucket every neighbour into one of `levels`
 * intensity bins by its luma ((r+g+b)/3, quantised to [0, levels-1]). Alongside
 * the per-bin count we accumulate the per-bin colour sums. The output pixel is
 * the *mean colour of whichever bin holds the most neighbours*.
 *
 * WHY this yields the smeared-brush look: within a flat region almost every
 * neighbour falls into the same intensity bin, so that bin wins and the pixel
 * collapses to one averaged "brush" colour — large patches flatten into solid
 * dabs. Across an edge the window straddles two intensity populations, but only
 * the *majority* side's bin wins, so the pixel snaps to the dominant side's mean
 * colour instead of blending the two (unlike a box blur, which would average
 * them into a muddy grey). The winner-take-all step is exactly what gives the
 * chunky, daubed, painted-with-a-loaded-brush appearance.
 *
 * WHY `radius` IS a pixel-radius (bake-scale flag): the neighbourhood is
 * literally (2·radius+1) pixels wide, so a 4px oil paint on the small preview
 * buffer is a weaker, finer operation than a 4px oil paint on the full-res
 * export. This field MUST be scaled by the renderer's `scaleFilterParams` for
 * the export to match the preview. `levels` is a dimensionless bucket count
 * (value-space quantisation, not spatial) — fewer levels = chunkier dabs — and
 * must NOT be scaled.
 *
 * Borders: the window is clamped to the image bounds; we just bin whatever
 * in-bounds samples exist, so edge pixels need no special pass. The centre
 * pixel is always in-bounds, so at least one bin is populated and the winning
 * bin's count is never zero.
 *
 * Cost: a direct (2r+1)² window with a per-pixel pass over `levels` scratch
 * bins (zeroed each pixel — cheaper than reallocating). Fine for a one-shot
 * filter pass at the radii used here.
 */

export const DEFAULT_OIL_PAINT: OilPaintParams = { kind: 'oilPaint', radius: 4, levels: 20 }

export function applyOilPaint(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: OilPaintParams,
): void {
  // radius 0 → 1×1 window → identity. We deliberately do NOT floor it up to 1:
  // the contract is that radius 0 is a no-op.
  const r = Math.max(0, Math.round(params.radius))
  if (r === 0 || width === 0 || height === 0) return

  // Quantisation buckets. Clamp into a sane range: at least 2 (otherwise there
  // is nothing to posterize) and at most 256 (one bin per 8-bit luma value).
  const levels = Math.max(2, Math.min(256, Math.round(params.levels)))
  const scale = (levels - 1) / 255

  // Read from an immutable snapshot so already-written output pixels don't
  // contaminate the neighbourhoods of pixels processed later in the pass.
  const src = new Uint8ClampedArray(data)

  // Scratch histograms reused across every pixel (zeroed per pixel below).
  // Int32 counts can't overflow; Float64 sums stay exact for the radii here.
  const intensityCount = new Int32Array(levels)
  const sumR = new Float64Array(levels)
  const sumG = new Float64Array(levels)
  const sumB = new Float64Array(levels)

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(height - 1, y + r)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(width - 1, x + r)
      const ci = (y * width + x) * 4

      intensityCount.fill(0)
      sumR.fill(0)
      sumG.fill(0)
      sumB.fill(0)

      // Bin every in-bounds neighbour by its luma; track the most-populous bin.
      // Strict `>` on the count makes ties resolve to the lowest bin index, so
      // the winner is deterministic regardless of scan order.
      let maxBin = 0
      let maxCount = 0
      for (let yy = y0; yy <= y1; yy++) {
        const row = yy * width
        for (let xx = x0; xx <= x1; xx++) {
          const ni = (row + xx) * 4
          const nr = src[ni]
          const ng = src[ni + 1]
          const nb = src[ni + 2]

          let bin = Math.round(((nr + ng + nb) / 3) * scale)
          if (bin < 0) bin = 0
          else if (bin > levels - 1) bin = levels - 1

          sumR[bin] += nr
          sumG[bin] += ng
          sumB[bin] += nb
          const c = ++intensityCount[bin]
          if (c > maxCount) {
            maxCount = c
            maxBin = bin
          }
        }
      }

      // The centre pixel is always counted, so maxCount ≥ 1 → no /0. Output the
      // mean colour of the winning bin.
      data[ci] = sumR[maxBin] / maxCount
      data[ci + 1] = sumG[maxBin] / maxCount
      data[ci + 2] = sumB[maxBin] / maxCount
      // Alpha (ci+3) intentionally left as the original.
    }
  }
}
