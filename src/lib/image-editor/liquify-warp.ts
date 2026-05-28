/**
 * Liquify warp brush — one stamp of the Photoshop Filter > Liquify family.
 *
 * The Canvas calls `applyLiquifyBrush` once per pointer-move along a stroke.
 * Each stamp READS from `src` and WRITES to `dst`; the caller snapshots the
 * working buffer into `src` before the stamp and swaps after. That separation
 * is crucial: within a single stamp every output pixel samples an immutable
 * source, so the per-pixel writes can never feed back into each other (no
 * stair-stepped, order-dependent artefacts) and bilinear taps are always
 * smooth. Compositing the strokes is the cumulative result of many stamps,
 * not of intra-stamp feedback.
 *
 * Modes (what the user sees):
 *   - push:    pixels follow the cursor's drag vector.
 *   - twirlCW: pixels swirl clockwise around the brush centre.
 *   - twirlCCW:pixels swirl counter-clockwise around the brush centre.
 *   - bloat:   pixels expand outward from the centre (think magnifying lens).
 *   - pucker:  pixels collapse inward toward the centre (opposite of bloat).
 *
 * Performance: we iterate ONLY over the brush's bounding box (cx±radius,
 * cy±radius) clamped to the image — never the whole image — and bail out
 * immediately when there's nothing to do (zero strength or radius).
 */

export type LiquifyMode = 'push' | 'twirlCW' | 'twirlCCW' | 'bloat' | 'pucker'

export type LiquifyStampParams = {
  /** RGBA source — read-only this stamp. Caller snapshots from the working
   *  canvas BEFORE the stamp, then swaps after. */
  src: Uint8ClampedArray
  /** RGBA dest — written in place. Same length as src. */
  dst: Uint8ClampedArray
  w: number
  h: number
  /** Brush centre in pixel coords (the cursor's position this frame). */
  cx: number
  cy: number
  /** Brush radius in pixels (pixels outside `radius` aren't touched). */
  radius: number
  /** 0..1 — overall stamp strength; the per-pixel weight is
   *  `strength · smoothstep(1, 0, distance/radius)` so the edge falls off
   *  smoothly. */
  strength: number
  mode: LiquifyMode
  /** Push mode only: drag vector (px) from the previous pointer position to
   *  the current one. Pixels within radius get displaced by this vector
   *  scaled by their per-pixel weight. Ignored for the other modes. */
  dx?: number
  dy?: number
}

/** Maximum rotation, in radians, at the centre of a full-strength twirl
 *  stamp. ~1.2 rad (~69°) is the sweet spot the spec calls out — big enough
 *  to be visually obvious in one stamp, small enough that a stroke of many
 *  stamps doesn't immediately self-overlap into mush. */
const TWIRL_MAX_ANGLE = 1.2

/** Bloat/pucker source-offset scale. With factor 0.5 a full-strength stamp
 *  pulls source from halfway to/from the centre, which matches PS Liquify
 *  feel without inverting through the singularity. */
const BLOAT_PUCKER_SCALE = 0.5

/**
 * Smoothstep on [0,1] — the canonical Hermite easing `3t² − 2t³`. We use it
 * to fade brush weight from 1 at the centre to 0 at the radius, so stamp
 * edges are soft rather than a hard disc.
 */
function smoothstep01(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t * t * (3 - 2 * t)
}

/**
 * Bilinear sample at (fx, fy) from RGBA source, clamping at the edges.
 * `out` is a reused accumulator so the inner loop never allocates; alpha is
 * interpolated so warps carry transparency consistently with colour.
 *
 * Edge policy: CLAMP. Wrapping or transparent borders would inject phantom
 * edge content into liquify warps near the image boundary; clamp preserves
 * the existing border colour the user already sees.
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
  const tx = fx - x0
  const ty = fy - y0
  const i00 = (y0 * w + x0) * 4
  const i10 = (y0 * w + x1) * 4
  const i01 = (y1 * w + x0) * 4
  const i11 = (y1 * w + x1) * 4
  const w00 = (1 - tx) * (1 - ty)
  const w10 = tx * (1 - ty)
  const w01 = (1 - tx) * ty
  const w11 = tx * ty
  out.r = src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11
  out.g = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11
  out.b = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11
  out.a = src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11
}

/**
 * Apply one Liquify warp stamp.
 *
 * For each pixel (x, y) in the brush's bounding box:
 *   1. d = hypot(x − cx, y − cy); skip if d > radius (outside the disc).
 *   2. weight w = strength · smoothstep01((radius − d) / radius)
 *      — 1 at the centre, smoothly 0 at the edge.
 *   3. Compute a mode-specific source-sample position (sx, sy) — where in
 *      `src` this output pixel "came from".
 *   4. Bilinear-sample `src` at (sx, sy) and write to `dst[x, y]`.
 *
 * Pixels outside the disc are left alone in `dst` — the caller is expected
 * to have seeded `dst` with the pre-stamp image (typical pattern: `dst` and
 * `src` start as copies of the working canvas, then swap after this call).
 * Leaving them untouched keeps the contract narrow and avoids redundant
 * copies when the same buffer pair is reused across many stamps.
 *
 * Skips entirely when there's nothing to do (strength ≤ 0, radius ≤ 0, or
 * empty image).
 */
export function applyLiquifyBrush(params: LiquifyStampParams): void {
  const { src, dst, w, h, cx, cy, radius, strength, mode } = params
  if (strength <= 0 || radius <= 0 || w === 0 || h === 0) return

  // Bounding box, clamped to the image. Bail if it's empty.
  const x0 = Math.max(0, Math.floor(cx - radius))
  const x1 = Math.min(w - 1, Math.ceil(cx + radius))
  const y0 = Math.max(0, Math.floor(cy - radius))
  const y1 = Math.min(h - 1, Math.ceil(cy + radius))
  if (x0 > x1 || y0 > y1) return

  const invR = 1 / radius
  const out = { r: 0, g: 0, b: 0, a: 0 }

  // Push uses the drag vector; default to 0 for the other modes so we never
  // accidentally displace on a missing field.
  const dragX = mode === 'push' ? (params.dx ?? 0) : 0
  const dragY = mode === 'push' ? (params.dy ?? 0) : 0

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const ox = x - cx
      const oy = y - cy
      const d = Math.hypot(ox, oy)
      if (d > radius) continue

      const i = (y * w + x) * 4
      const weight = strength * smoothstep01((radius - d) * invR)
      let sx = x
      let sy = y

      switch (mode) {
        case 'push':
          // Read from where the pixel "came from" — i.e. opposite the drag.
          // The visible effect is that content moves WITH the cursor.
          sx = x - dragX * weight
          sy = y - dragY * weight
          break
        case 'twirlCW': {
          // To make the content rotate CW on screen (y-down) we must read
          // the source from the CCW-rotated position — i.e. apply R(−angle)
          // to the offset. (Reading from R(+angle) would render visually
          // CCW once y is flipped down.)
          const angle = weight * TWIRL_MAX_ANGLE
          const c = Math.cos(angle)
          const s = Math.sin(angle)
          // R(−angle) · (ox, oy) =  ( c·ox + s·oy, −s·ox + c·oy )
          sx = cx + c * ox + s * oy
          sy = cy - s * ox + c * oy
          break
        }
        case 'twirlCCW': {
          // Mirror of twirlCW: read from R(+angle) so content swirls CCW
          // on screen.
          const angle = weight * TWIRL_MAX_ANGLE
          const c = Math.cos(angle)
          const s = Math.sin(angle)
          // R(+angle) · (ox, oy) = ( c·ox − s·oy,  s·ox + c·oy )
          sx = cx + c * ox - s * oy
          sy = cy + s * ox + c * oy
          break
        }
        case 'bloat':
          // Sample from a point pulled BACK toward the centre — that point's
          // content visibly expands outward to fill (x, y).
          sx = cx + ox * (1 - weight * BLOAT_PUCKER_SCALE)
          sy = cy + oy * (1 - weight * BLOAT_PUCKER_SCALE)
          break
        case 'pucker':
          // Mirror of bloat: sample from a point pushed OUTWARD; content
          // visibly contracts inward toward the centre.
          sx = cx + ox * (1 + weight * BLOAT_PUCKER_SCALE)
          sy = cy + oy * (1 + weight * BLOAT_PUCKER_SCALE)
          break
      }

      sampleBilinear(src, w, h, sx, sy, out)
      dst[i] = out.r
      dst[i + 1] = out.g
      dst[i + 2] = out.b
      dst[i + 3] = out.a
    }
  }
}
