/**
 * Vignette — darken (or lighten) the frame toward the edges, the way a real
 * lens falls off at its corners. This is a *spatial* filter (the result at a
 * pixel depends on that pixel's position, not its neighbours) so it follows
 * the shared FILTER signature and mutates `data` in place.
 *
 * WHY percentages, not pixel radii: `midpoint` and `feather` are expressed as
 * a fraction of the image's half-diagonal, and `roundness` / `amount` are
 * dimensionless. Because the falloff is computed in a coordinate space that is
 * normalized by the image's own half-diagonal, the *visual* result is identical
 * whether we render the small preview buffer or the full-resolution export
 * buffer. That means NONE of these fields need bake-scale (`scaleFilterParams`)
 * scaling — a 50%-midpoint vignette lands at the same visual spot on every
 * buffer size. (Contrast with a pixel-radius blur, which must be scaled.)
 */

export type VignetteParams = {
  kind: 'vignette'
  /** -100..100. Negative darkens the edges (multiply), positive lightens (screen). */
  amount: number
  /** 0..100. Percent of the half-diagonal radius where the falloff *starts*. */
  midpoint: number
  /** -100..100. Biases the distance metric between circular (0) and rectangular. */
  roundness: number
  /** 0..100. Width of the soft transition band, as a percent of the half-diagonal. */
  feather: number
}

export const DEFAULT_VIGNETTE: VignetteParams = {
  kind: 'vignette',
  amount: -40,
  midpoint: 50,
  roundness: 0,
  feather: 50,
}

/** Hermite smoothstep, clamped to [0,1]. Returns 0 below `edge0`, 1 above `edge1`. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1
  let t = (x - edge0) / (edge1 - edge0)
  if (t < 0) t = 0
  else if (t > 1) t = 1
  return t * t * (3 - 2 * t)
}

/**
 * Apply a radial vignette.
 *
 * Algorithm: for each pixel we compute a distance from the image centre,
 * normalized so that the corner sits at distance ~1. `roundness` morphs that
 * metric: roundness < 0 leans toward a Euclidean circle, roundness > 0 leans
 * toward a Chebyshev (max-of-axes) rectangle, blended linearly. `midpoint`
 * marks where the effect begins and `feather` how gradually it ramps to full
 * strength at the corner; both feed a smoothstep so the band is soft.
 *
 * The resulting 0..1 falloff `f` (0 = untouched centre, 1 = full effect at the
 * edge) modulates each RGB channel:
 *   amount < 0 → darken via multiply:  out = in * (1 - k*f)
 *   amount > 0 → lighten via screen:   out = 255 - (255-in) * (1 - k*f)
 * where k = |amount|/100. Alpha is left untouched.
 */
export function applyVignette(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: VignetteParams,
): void {
  const k = Math.max(-100, Math.min(100, params.amount)) / 100
  if (k === 0) return

  const cx = (width - 1) / 2
  const cy = (height - 1) / 2
  // Half-diagonal: the distance from centre to a corner. Normalizing every
  // pixel offset by this makes `midpoint`/`feather` resolution-independent
  // percentages — the corner always lands near normalized distance 1.
  const halfDiag = Math.sqrt(cx * cx + cy * cy) || 1

  const mid = Math.max(0, Math.min(100, params.midpoint)) / 100
  // Feather defines the width of the ramp; clamp the smoothstep window so the
  // edge (distance 1) is always fully affected even with a wide feather.
  const feather = Math.max(0, Math.min(100, params.feather)) / 100
  // `roundness` in -1..1: blend weight between circular (0) and rectangular (1).
  const round = Math.max(-100, Math.min(100, params.roundness)) / 100
  // Map roundness so 0 = pure circle, +1 = pure rectangle, -1 = "rounder than
  // circle" (we still treat negative as circle-dominant). Clamp to [0,1].
  const rectWeight = Math.max(0, round)
  const darken = k < 0
  const strength = Math.abs(k)

  // Falloff starts at `mid` and reaches full effect at `mid + feather`,
  // but never past the corner (1.0). When feather is 0 the smoothstep
  // special-cases the equal-edge divide.
  const edge0 = mid
  const edge1 = Math.min(1, mid + feather)

  for (let y = 0; y < height; y++) {
    const dy = (y - cy) / halfDiag
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / halfDiag
      // Circular distance (Euclidean) and rectangular distance (Chebyshev),
      // both already normalized to ~1 at the corner.
      const dCirc = Math.sqrt(dx * dx + dy * dy)
      const dRect = Math.max(Math.abs(dx), Math.abs(dy)) * Math.SQRT2
      const dist = dCirc * (1 - rectWeight) + dRect * rectWeight

      const f = smoothstep(edge0, edge1, dist)
      if (f === 0) continue

      const i = (y * width + x) * 4
      const m = strength * f // 0..1 effect magnitude at this pixel
      if (darken) {
        const scale = 1 - m
        data[i] = data[i] * scale
        data[i + 1] = data[i + 1] * scale
        data[i + 2] = data[i + 2] * scale
      } else {
        // Screen toward white: brighten edges.
        data[i] = 255 - (255 - data[i]) * (1 - m)
        data[i + 1] = 255 - (255 - data[i + 1]) * (1 - m)
        data[i + 2] = 255 - (255 - data[i + 2]) * (1 - m)
      }
    }
  }
}
