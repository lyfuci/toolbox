import type { RippleParams } from './types'
/**
 * Ripple — a Photoshop Distort > Ripple clone: a fine, water-on-a-pond
 * displacement. Like Wave it is a spatial *displacement* filter (the colour at
 * a pixel comes from a nudged source position) and follows the shared FILTER
 * signature, mutating `data` in place.
 *
 * v1 model: PS Ripple looks irregular because it sums several short, mutually
 * perpendicular ripples. We approximate it with two perpendicular sine waves —
 * the horizontal displacement is driven by a sine of y and the vertical by a
 * sine of x — giving a believable cross-hatched water shimmer that is cheap and
 * fully deterministic.
 *
 * WHY snapshot + bilinear: identical reasoning to Wave — we read displaced
 * (fractional) source positions, so we sample from an immutable copy (no
 * write-back feedback) and bilinear-interpolate the four neighbours so the
 * rippled edges stay smooth instead of staircased. Out-of-range taps clamp to
 * the edge (calmer than wrapping the far edge in).
 *
 * BAKE-SCALE: `size` is a ripple *wavelength in pixels*, so it is
 * resolution-dependent and MUST be multiplied by the bake scale
 * (`scaleFilterParams`) — otherwise the ripple spacing tuned on a small preview
 * would be far too tight on the full-resolution export. `amount` is
 * deliberately a *dimensionless* strength: the peak displacement is derived as
 * a fraction of `size` (peak = size * amount/100 * a constant), so doubling
 * resolution scales `size`, which already scales the displacement with it.
 * Therefore `amount` does NOT need bake-scale scaling — only `size` does.
 */

export const DEFAULT_RIPPLE: RippleParams = {
  kind: 'ripple',
  amount: 50,
  size: 12,
}

/**
 * Bilinear sample at (fx, fy) from RGBA source, clamping to the image edges.
 * `out` is a reused accumulator so we don't allocate per pixel; alpha is
 * interpolated so displacement carries transparency.
 *
 * (Duplicated locally rather than imported: the equivalent helper in
 * filter-ops.ts is module-private, and this file must not edit that file.)
 */
function sampleBilinear(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  fx: number,
  fy: number,
  out: { r: number; g: number; b: number; a: number },
): void {
  if (fx < 0) fx = 0
  else if (fx > w - 1) fx = w - 1
  if (fy < 0) fy = 0
  else if (fy > h - 1) fy = h - 1
  const x0 = Math.floor(fx)
  const x1 = Math.min(w - 1, x0 + 1)
  const y0 = Math.floor(fy)
  const y1 = Math.min(h - 1, y0 + 1)
  const dx = fx - x0
  const dy = fy - y0
  const i00 = (y0 * w + x0) * 4
  const i10 = (y0 * w + x1) * 4
  const i01 = (y1 * w + x0) * 4
  const i11 = (y1 * w + x1) * 4
  const w00 = (1 - dx) * (1 - dy)
  const w10 = dx * (1 - dy)
  const w01 = (1 - dx) * dy
  const w11 = dx * dy
  out.r = src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11
  out.g = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11
  out.b = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11
  out.a = src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11
}

/**
 * Apply the Ripple distortion.
 *
 * Algorithm: two perpendicular sine ripples whose wavelength comes from `size`
 * and whose peak displacement is a fraction of `size` scaled by `amount`:
 *   peak = size * (amount / 100) * RIPPLE_FRACTION
 *   dx   = peak * sin(2π·y / size)
 *   dy   = peak * sin(2π·x / size)
 * Each output pixel (x, y) samples the source at (x + dx, y + dy) bilinearly,
 * from a snapshot of the original buffer.
 *
 * Tying peak to `size` (rather than to a raw pixel count) is what makes
 * `amount` dimensionless and bake-scale-free: scale the image up and `size`
 * scales, dragging the displacement up proportionally with no separate
 * scaling of `amount`.
 *
 * `amount === 0` is an exact identity (peak 0 → zero offset → each pixel
 * samples itself); `size <= 0` is treated as a no-op to avoid divide-by-zero.
 */
export function applyRipple(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: RippleParams,
): void {
  const amount = Math.max(-100, Math.min(100, params.amount))
  const size = params.size
  if (amount === 0 || size <= 0 || width === 0 || height === 0) return

  // Peak displacement as a fraction of the wavelength. 0.5 keeps the ripple
  // legible at amount=100 (half a wavelength of throw) without tearing the
  // image apart.
  const RIPPLE_FRACTION = 0.5
  const peak = size * (amount / 100) * RIPPLE_FRACTION
  const k = (Math.PI * 2) / size

  // Snapshot the source so reads are never polluted by earlier writes.
  const src = new Uint8ClampedArray(data)
  const out = { r: 0, g: 0, b: 0, a: 0 }

  for (let y = 0; y < height; y++) {
    // Horizontal offset is constant across a row (depends only on y).
    const dx = peak * Math.sin(k * y)
    for (let x = 0; x < width; x++) {
      // Vertical offset depends only on x.
      const dy = peak * Math.sin(k * x)
      sampleBilinear(src, width, height, x + dx, y + dy, out)
      const i = (y * width + x) * 4
      data[i] = out.r
      data[i + 1] = out.g
      data[i + 2] = out.b
      data[i + 3] = out.a
    }
  }
}
