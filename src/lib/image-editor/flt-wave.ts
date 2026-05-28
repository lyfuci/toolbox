import type { WaveParams } from './types'
/**
 * Wave — a Photoshop Distort > Wave clone. Every output pixel is *pulled* from
 * a wavy offset of its own position, so straight features bend into waves. This
 * is a spatial *displacement* filter: the colour at (x, y) depends on the
 * source colour somewhere else, not on the pixel's own value. Like the other
 * displacement filters it follows the shared FILTER signature and mutates
 * `data` in place.
 *
 * WHY snapshot + bilinear: because we read from displaced (often fractional)
 * source positions, we must (1) sample from an immutable copy of the source —
 * if we read from `data` while writing into it the already-displaced pixels
 * would feed back and smear the result — and (2) interpolate between the four
 * neighbouring texels. Nearest-sampling a fractional coordinate produces
 * staircase/jagged edges; bilinear keeps the waved edge smooth.
 *
 * WHY clamp-to-edge (not wrap): a wave can ask for a source pixel just outside
 * the image. Clamping repeats the border colour, which reads as the edge being
 * gently stretched — visually calmer than wrapping the opposite edge in, which
 * injects unrelated colour. This matches the convention used by the other
 * displacement filters in this codebase.
 *
 * BAKE-SCALE: `amplitude` and `wavelength` are both measured in *source
 * pixels*, so they are resolution-dependent and MUST be multiplied by the bake
 * scale (`scaleFilterParams`) when the full-resolution buffer differs from the
 * preview buffer — otherwise a wave tuned on a small preview would look far too
 * weak (or short) on the exported image. `type` is an enum and is not scaled.
 */

export const DEFAULT_WAVE: WaveParams = {
  kind: 'wave',
  amplitude: 20,
  wavelength: 80,
  type: 'sine',
}

/**
 * Evaluate the chosen periodic waveform at phase `p` (radians). Both forms are
 * normalized to peak amplitude 1 and period 2π so callers can scale by a single
 * `amplitude`. 'triangle' is the classic /\/\ shape: it rises linearly to +1 at
 * a quarter period, falls through 0 to -1, then back — phase-aligned with sine
 * so the two waveforms peak at the same coordinate.
 */
function waveform(p: number, type: WaveParams['type']): number {
  if (type === 'triangle') {
    // Normalize phase into [0, 1) periods, then build a unit triangle that
    // matches sine's sign/peak positions: 0→0, 0.25→+1, 0.5→0, 0.75→-1.
    const TAU = Math.PI * 2
    let t = (p / TAU) % 1
    if (t < 0) t += 1
    // Piecewise-linear triangle peaking at t=0.25 (+1) and t=0.75 (-1).
    if (t < 0.25) return t * 4
    if (t < 0.75) return 2 - t * 4
    return t * 4 - 4
  }
  return Math.sin(p)
}

/**
 * Bilinear sample at (fx, fy) from RGBA source, clamping to the image edges.
 * Returns interpolated channels via the mutable `out` accumulator (reused
 * across calls to avoid per-pixel allocation). Alpha is interpolated too so
 * displacement carries transparency correctly.
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
 * Apply the Wave distortion.
 *
 * Algorithm: PS Wave displaces along both axes. We drive the *horizontal*
 * displacement from the row (y) and the *vertical* displacement from the column
 * (x), so a vertical line ripples side-to-side and a horizontal line ripples
 * up-and-down:
 *   dx = amplitude * waveform(2π·y / wavelength)
 *   dy = amplitude * waveform(2π·x / wavelength)
 * Each output pixel (x, y) is then sampled from the source at (x + dx, y + dy)
 * with bilinear interpolation. We read from a snapshot of the original buffer
 * so partly-written output never feeds back.
 *
 * `amplitude === 0` is an exact identity (waveform·0 = 0 → zero offset → every
 * pixel samples itself), and a non-positive `wavelength` is treated as a no-op
 * to avoid divide-by-zero.
 */
export function applyWave(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: WaveParams,
): void {
  const { amplitude, wavelength, type } = params
  if (amplitude === 0 || wavelength <= 0 || width === 0 || height === 0) return

  // Snapshot the source so reads are never polluted by earlier writes.
  const src = new Uint8ClampedArray(data)
  const k = (Math.PI * 2) / wavelength
  const out = { r: 0, g: 0, b: 0, a: 0 }

  for (let y = 0; y < height; y++) {
    // Horizontal offset is constant across a row (depends only on y).
    const dx = amplitude * waveform(k * y, type)
    for (let x = 0; x < width; x++) {
      // Vertical offset depends only on x.
      const dy = amplitude * waveform(k * x, type)
      sampleBilinear(src, width, height, x + dx, y + dy, out)
      const i = (y * width + x) * 4
      data[i] = out.r
      data[i + 1] = out.g
      data[i + 2] = out.b
      data[i + 3] = out.a
    }
  }
}
