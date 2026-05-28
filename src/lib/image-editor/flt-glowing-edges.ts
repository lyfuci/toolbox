import type { GlowingEdgesParams } from './types'
/**
 * Glowing Edges — the neon inverse of Find Edges (Photoshop Filter → Stylize →
 * Glowing Edges). Spatial filter → shared FILTER signature, mutates `data` in
 * place. Where Find Edges paints dark edges on a WHITE ground (it inverts the
 * Sobel magnitude, `255 − mag`), Glowing Edges paints BRIGHT edges on a BLACK
 * ground — flat regions go to 0 and only the gradients light up, like wire
 * glowing in the dark.
 *
 * WHY PER-CHANNEL (keeps edge COLOUR): Find Edges first collapses the image to
 * one luma channel, so its output is greyscale. Glowing Edges instead runs an
 * INDEPENDENT Sobel on R, G and B and writes each channel's own magnitude back
 * to that channel. A red↔black border therefore lights up the red channel only,
 * so the glowing edge inherits the colour of the transition that produced it —
 * matching PS, which detects edges per channel. There is no luma conversion.
 *
 * ALGORITHM:
 *   1. Snapshot the input (`src`) so taps always read the ORIGINAL pixels, not
 *      edge values written earlier in the pass.
 *   2. For every pixel (borders included — see below) and each channel c, take
 *      the eight 3×3 Sobel neighbours offset by ±`step` and combine them with
 *      the standard Sobel weights into gx, gy; magnitude = √(gx² + gy²); the
 *      output channel is `magnitude · gain`, auto-clamped to 0..255 by the
 *      Uint8ClampedArray. Written to a separate `out` buffer.
 *   3. If `smoothness` rounds to > 0, soften the glow with a small SEPARABLE box
 *      blur (radius = round(smoothness)) over R, G, B — a horizontal pass then a
 *      vertical pass, each gathering only in-bounds samples and dividing by the
 *      count, so border pixels need no special case.
 *   4. Copy the (optionally blurred) R, G, B back into `data`. Alpha untouched.
 *
 * BORDERS — clamp-per-tap, NO special frame pass: unlike Find Edges (which
 * hard-writes the 1px border) every pixel here, edge pixels included, gets a
 * real Sobel computed on sample coordinates CLAMPED to the image bounds. This
 * is what makes the filter exact on a flat field: when all eight clamped taps
 * are equal, gx = gy = 0, so the whole result — frame and interior alike — is
 * pure black. A border constant would leave a non-black rim.
 *
 * WHY `edgeWidth` AND `smoothness` ARE spatial (bake-scale flags): `edgeWidth`
 * is the Sobel sampling step in PIXELS and `smoothness` is the post-blur radius
 * in PIXELS. A 2px step / 6px blur on the small preview buffer is a coarser,
 * stronger operation than the same numbers on the full-res export, so BOTH
 * fields MUST be scaled by the renderer's `scaleFilterParams` for the export to
 * match the preview (treat them as pixel distances, like any radius).
 * `brightness` is a dimensionless intensity GAIN (0..100), not a distance, so it
 * must NOT be scaled.
 *
 * Edge cases: width or height 0 → no-op. A perfectly uniform field has no
 * gradient anywhere → all-black result. Alpha is left untouched.
 */

export const DEFAULT_GLOWING_EDGES: GlowingEdgesParams = {
  kind: 'glowingEdges',
  edgeWidth: 2,
  brightness: 60,
  smoothness: 6,
}

export function applyGlowingEdges(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: GlowingEdgesParams,
): void {
  if (width === 0 || height === 0) return

  // Sobel sampling step in pixels; at least 1 so taps never collapse onto the
  // centre. No upper clamp — the field is documented 1..14 and the renderer
  // bake-scales it; we just floor it up like surface-blur's radius.
  const step = Math.max(1, Math.round(params.edgeWidth))

  // Map brightness 0..100 → an edge-intensity gain. The +0.5 floor keeps faint
  // edges visible even at brightness 0; brightness 60 ≈ gain 2.9.
  const gain = 0.5 + Math.max(0, Math.min(100, params.brightness)) / 25

  // Read taps from an immutable snapshot so written edge values never feed back
  // into a later pixel's Sobel neighbourhood.
  const src = new Uint8ClampedArray(data)

  // Edge magnitudes land in their own buffer (auto-clamped to 0..255).
  const out = new Uint8ClampedArray(data.length)

  for (let y = 0; y < height; y++) {
    // Pre-clamped neighbour rows for this scanline.
    const ym = Math.max(0, y - step) * width
    const yc = y * width
    const yp = Math.min(height - 1, y + step) * width
    for (let x = 0; x < width; x++) {
      // Pre-clamped neighbour columns.
      const xm = Math.max(0, x - step)
      const xp = Math.min(width - 1, x + step)

      // Eight neighbour base offsets (row + col) for the 3×3 Sobel kernel.
      const tl = (ym + xm) * 4
      const tc = (ym + x) * 4
      const tr = (ym + xp) * 4
      const cl = (yc + xm) * 4
      const cr = (yc + xp) * 4
      const bl = (yp + xm) * 4
      const bc = (yp + x) * 4
      const br = (yp + xp) * 4

      const oi = (yc + x) * 4
      // Independent Sobel per channel keeps edge colour.
      for (let c = 0; c < 3; c++) {
        const gx =
          -src[tl + c] +
          src[tr + c] -
          2 * src[cl + c] +
          2 * src[cr + c] -
          src[bl + c] +
          src[br + c]
        const gy =
          -src[tl + c] -
          2 * src[tc + c] -
          src[tr + c] +
          src[bl + c] +
          2 * src[bc + c] +
          src[br + c]
        out[oi + c] = Math.sqrt(gx * gx + gy * gy) * gain
      }
    }
  }

  const blurR = Math.round(params.smoothness)
  if (blurR > 0) {
    // Separable box blur over R, G, B only. Horizontal pass out → tmp, then
    // vertical pass tmp → out, each gathering just the in-bounds samples and
    // dividing by their count (so border pixels need no special case).
    const tmp = new Uint8ClampedArray(data.length)

    // Horizontal pass.
    for (let y = 0; y < height; y++) {
      const row = y * width
      for (let x = 0; x < width; x++) {
        const x0 = Math.max(0, x - blurR)
        const x1 = Math.min(width - 1, x + blurR)
        let sr = 0
        let sg = 0
        let sb = 0
        for (let xx = x0; xx <= x1; xx++) {
          const ni = (row + xx) * 4
          sr += out[ni]
          sg += out[ni + 1]
          sb += out[ni + 2]
        }
        const n = x1 - x0 + 1
        const ti = (row + x) * 4
        tmp[ti] = sr / n
        tmp[ti + 1] = sg / n
        tmp[ti + 2] = sb / n
      }
    }

    // Vertical pass.
    for (let y = 0; y < height; y++) {
      const y0 = Math.max(0, y - blurR)
      const y1 = Math.min(height - 1, y + blurR)
      for (let x = 0; x < width; x++) {
        let sr = 0
        let sg = 0
        let sb = 0
        for (let yy = y0; yy <= y1; yy++) {
          const ni = (yy * width + x) * 4
          sr += tmp[ni]
          sg += tmp[ni + 1]
          sb += tmp[ni + 2]
        }
        const n = y1 - y0 + 1
        const oi = (y * width + x) * 4
        out[oi] = sr / n
        out[oi + 1] = sg / n
        out[oi + 2] = sb / n
      }
    }
  }

  // Copy the edge result back into R, G, B. Alpha (i+3) left as the original.
  for (let i = 0; i < data.length; i += 4) {
    data[i] = out[i]
    data[i + 1] = out[i + 1]
    data[i + 2] = out[i + 2]
  }
}
