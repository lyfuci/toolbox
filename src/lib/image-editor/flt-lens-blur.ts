import type { LensBlurParams } from './types'
/**
 * Lens Blur — depth-of-field bokeh blur (Photoshop Filter → Blur → Lens Blur).
 * Spatial filter → shared FILTER signature, mutates `data` in place.
 *
 * WHY this is NOT a Gaussian/box blur: an ordinary blur convolves with a bell
 * (Gaussian) or flat-square (box) kernel, both of which weight the *whole*
 * neighbourhood and taper toward — or stop at — a soft/square boundary. A real
 * camera lens doesn't: an out-of-focus point of light projects the shape of the
 * APERTURE onto the sensor — for a roughly circular iris, a uniformly-bright
 * DISC. So we convolve with a flat aperture disc: every sample inside
 * dx² + dy² ≤ r² counts, every sample outside counts for nothing. Because the
 * disc is FLAT (not a bell), its edge is hard — a bright out-of-focus point
 * smears into a crisp-rimmed circle rather than a feathered blob. That hard rim
 * is the visual signature of bokeh, and it's exactly what a Gaussian can't
 * reproduce (a Gaussian would render the same point as a soft fuzzy dot).
 *
 * BLOOM / THRESHOLD — glowing highlight discs: a plain disc average alone gives
 * the right *shape* but mushes bright specular highlights into the surrounding
 * mid-tones, so they read as dull grey circles instead of the glowing discs a
 * fast lens throws. Real bokeh blooms because a highlight is far brighter than
 * its surround and dominates the disc it lands in. We emulate that by giving
 * each disc SAMPLE a weight based on the SAMPLE's own luma: a normal pixel
 * weighs 1, but a pixel brighter than `threshold` weighs more, so wherever a
 * highlight falls within a destination pixel's disc it pulls that pixel toward
 * the highlight's colour. The result: bright sources spread as luminous,
 * hard-edged bokeh circles while the rest of the image blurs evenly.
 *   • `threshold` (0..255 luma): the brightness above which a pixel blooms.
 *     Specular highlights sit near 255; midtones below `threshold` get the
 *     plain weight 1 and just blur normally.
 *   • `bloom` (0..100): how hard above-threshold pixels are over-weighted. 0
 *     disables blooming (a pure disc average); higher values make highlights
 *     dominate their discs more aggressively. The per-sample weight is
 *     `1 + bloomGain·4·((luma − threshold) / (255 − threshold))`, so a sample
 *     exactly AT threshold still weighs 1 and a full-255 sample weighs up to
 *     `1 + 4·bloomGain`.
 *
 * WHY `radius` IS a pixel-radius (bake-scale flag): the aperture disc is
 * literally `radius` pixels across, so a 12px lens blur on the small preview
 * buffer is a far stronger, coarser effect than 12px on the full-res export.
 * This field MUST be multiplied by the renderer's `scaleFilterParams` for the
 * export to match the preview (treat it like any blur radius). `bloom` (0..100)
 * and `threshold` (0..255 luma) are VALUE-space, not spatial — they must NOT be
 * scaled.
 *
 * Borders: disc samples that fall outside the image are simply skipped (we do
 * NOT clamp/duplicate edge pixels, which would bias the average toward the
 * border colour). The centre sample (dx = dy = 0) is always in-bounds and
 * always qualifies, so the total weight is > 0 for every pixel — no /0.
 *
 * Cost: a direct disc convolution — about π·r² samples per pixel. For the
 * radii here this is a one-shot pass; the disc offsets are precomputed once and
 * reused for every pixel. Alpha is left untouched.
 */

export const DEFAULT_LENS_BLUR: LensBlurParams = {
  kind: 'lensBlur',
  radius: 12,
  bloom: 40,
  threshold: 200,
}

/** Rec. 601 luma; bloom keys off perceived brightness, not a raw channel. */
function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

export function applyLensBlur(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: LensBlurParams,
): void {
  // radius 0 → 1×1 disc → identity. Guard BEFORE building the disc / snapshot
  // so an empty buffer (or a no-op radius) returns immediately and cheaply.
  const r = Math.max(0, Math.round(params.radius))
  if (r === 0 || width === 0 || height === 0) return

  // Precompute the flat aperture-disc offsets ONCE: every (dx, dy) inside the
  // radius. Reused for every destination pixel. r² compared against dx²+dy² so
  // the boundary is a true circle, not the square a box blur would use.
  const offX: number[] = []
  const offY: number[] = []
  const r2 = r * r
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r2) {
        offX.push(dx)
        offY.push(dy)
      }
    }
  }
  const discLen = offX.length

  // bloom 0..100 → 0..1 gain. threshold is a 0..255 luma value (NOT rounded —
  // it's a value-space tolerance, kept at full precision like the spec wants).
  const bloomGain = Math.max(0, Math.min(100, params.bloom)) / 100
  const thr = Math.max(0, Math.min(255, params.threshold))

  // Read from an immutable snapshot so already-written output pixels don't
  // contaminate the discs of pixels processed later in the pass.
  const src = new Uint8ClampedArray(data)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumR = 0
      let sumG = 0
      let sumB = 0
      let sumW = 0

      for (let k = 0; k < discLen; k++) {
        const sx = x + offX[k]
        const sy = y + offY[k]
        // Skip out-of-bounds disc samples — don't clamp/duplicate the border.
        if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue

        const ni = (sy * width + sx) * 4
        const nr = src[ni]
        const ng = src[ni + 1]
        const nb = src[ni + 2]

        // Per-SAMPLE weight: 1 normally; bright (above-threshold) samples are
        // over-weighted so highlights bloom into glowing bokeh discs. The
        // +1e-6 guards the thr = 255 case (zero divisor) without affecting any
        // realistic threshold.
        let w = 1
        const l = luma(nr, ng, nb)
        if (l > thr) {
          w = 1 + bloomGain * 4 * ((l - thr) / (255 - thr + 1e-6))
        }

        sumR += w * nr
        sumG += w * ng
        sumB += w * nb
        sumW += w
      }

      // sumW is always ≥ 1 (the centre sample qualifies), so no /0.
      const di = (y * width + x) * 4
      data[di] = sumR / sumW
      data[di + 1] = sumG / sumW
      data[di + 2] = sumB / sumW
      // Alpha (di+3) intentionally left as the original.
    }
  }
}
