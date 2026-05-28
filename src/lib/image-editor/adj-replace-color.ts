import type { ReplaceColorParams } from './types'
/**
 * Replace Color adjustment (Photoshop Image > Adjustments > Replace Color).
 *
 * The user picks a target colour from the image and shifts every "matching"
 * pixel in HSL space. Matching is a soft Euclidean RGB distance to the target:
 * exact target → full strength; further away → weaker contribution; beyond
 * `fuzziness` → no effect. The soft falloff (vs. a hard cut) matters because
 * destination colours often straddle the threshold across smooth gradients;
 * a binary mask would produce visible banding around the threshold contour,
 * while a linear ramp blends the replacement back into the surrounding hue.
 *
 * Why HSL shifts rather than "replace with target B"?
 *   - It preserves shading. A red T-shirt with highlights and shadows stays
 *     a recognisable T-shirt when its hue is rotated to blue — pixels keep
 *     their relative lightness. A flat colour swap would flatten the garment.
 *   - It matches Photoshop's UI, which exposes Hue / Saturation / Lightness
 *     sliders (not an RGB destination).
 *
 * This is a per-pixel transform — no neighbourhood sampling, no radius — so
 * it mutates the RGBA buffer in place and leaves alpha untouched. It contains
 * zero DOM dependencies (no `canvas`, no `ImageData`, no `document`), which
 * keeps the algorithm fully node-testable.
 */

export const DEFAULT_REPLACE_COLOR: ReplaceColorParams = {
  kind: 'replaceColor',
  target: { r: 255, g: 0, b: 0 },
  fuzziness: 40,
  hueShift: 0,
  saturationShift: 0,
  lightnessShift: 0,
}

/**
 * Compute the match weight in [0, 1] for a single RGB triple against the
 * target colour at the given fuzziness.
 *
 * Falloff shape: a linear ramp `max(0, 1 - dist / fuzziness)`. A linear ramp
 * is cheap to evaluate and visually monotone — the alternative smoothstep
 * gives a slightly softer shoulder, but at this fuzziness range (0..200) the
 * difference is dominated by display quantisation. Linear keeps reasoning
 * about the test cases simple (a pixel exactly at the threshold has weight 0
 * rather than ~0.5).
 *
 * Special case: `fuzziness <= 0` collapses the ramp into a hard exact-match
 * test — only pixels at zero distance return weight 1. This avoids producing
 * NaN from a 0/0 division and gives the dialog's bottom slider position a
 * sensible meaning (the "only this exact colour" setting).
 */
function matchWeight(
  r: number,
  g: number,
  b: number,
  target: { r: number; g: number; b: number },
  fuzziness: number,
): number {
  const dr = r - target.r
  const dg = g - target.g
  const db = b - target.b
  const distSq = dr * dr + dg * dg + db * db
  if (fuzziness <= 0) return distSq === 0 ? 1 : 0
  const dist = Math.sqrt(distSq)
  if (dist >= fuzziness) return 0
  return 1 - dist / fuzziness
}

/**
 * Apply a Replace Color adjustment in place.
 *
 * For each non-transparent pixel:
 *   1. Compute its soft match `weight` against `target` / `fuzziness`.
 *   2. Skip pixels with weight 0 — leaving the byte triple bit-for-bit
 *      identical to the input (critical for the "far pixel untouched" test
 *      and for avoiding pointless rounding noise on the vast majority of
 *      pixels in a typical image).
 *   3. Otherwise convert to HSL, add the slider shifts, convert back, and
 *      linearly blend the shifted colour back over the original by `weight`.
 *
 * Alpha is never modified. Fully transparent pixels are skipped wholesale
 * because their RGB triple is meaningless (premultiplied or not, alpha 0
 * means the pixel contributes no colour).
 */
export function applyReplaceColor(
  data: Uint8ClampedArray,
  params: ReplaceColorParams,
): void {
  const { target, fuzziness, hueShift, saturationShift, lightnessShift } = params
  const hsl = { h: 0, s: 0, l: 0 }
  const rgb = { r: 0, g: 0, b: 0 }
  // Pre-normalise the slider shifts to the [0,1] HSL space the helpers use.
  // hue is a degrees → unit-interval offset that gets wrapped per-pixel.
  const hueOffset = hueShift / 360
  const satOffset = saturationShift / 100
  const lightOffset = lightnessShift / 100

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue // transparent: no meaningful colour

    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const weight = matchWeight(r, g, b, target, fuzziness)
    if (weight === 0) continue // far from target: leave bytes exactly as-is

    rgbToHsl(r, g, b, hsl)
    // Hue wraps; sat/light clamp. ((x % 1) + 1) % 1 normalises any
    // shift (including large or negative) back into [0, 1).
    const hNew = (((hsl.h + hueOffset) % 1) + 1) % 1
    const sNew = clamp01(hsl.s + satOffset)
    const lNew = clamp01(hsl.l + lightOffset)
    hslToRgb(hNew, sNew, lNew, rgb)

    // Blend shifted colour over original by weight. weight=1 → pure shifted,
    // weight=0 → pure original (but already short-circuited above).
    const inv = 1 - weight
    data[i] = Math.round(r * inv + rgb.r * weight)
    data[i + 1] = Math.round(g * inv + rgb.g * weight)
    data[i + 2] = Math.round(b * inv + rgb.b * weight)
    // data[i + 3] (alpha) intentionally untouched.
  }
}

// ── Color-space helpers (local copy; keeps this file dependency-free) ──────

/**
 * RGB (0..255) → HSL (each component in [0, 1]). Standard formulation; the
 * out-parameter object avoids allocating a fresh literal per pixel.
 */
function rgbToHsl(
  r: number,
  g: number,
  b: number,
  out: { h: number; s: number; l: number },
): void {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0)
        break
      case gn:
        h = (bn - rn) / d + 2
        break
      default:
        h = (rn - gn) / d + 4
    }
    h /= 6
  }
  out.h = h
  out.s = s
  out.l = l
}

/**
 * HSL ([0,1] each) → RGB (0..255 rounded). Mirrors the conventional
 * algorithm; isolated here so this file has no cross-module dependency on
 * the editor's other adjustments.
 */
function hslToRgb(
  h: number,
  s: number,
  l: number,
  out: { r: number; g: number; b: number },
): void {
  if (s === 0) {
    const v = Math.round(l * 255)
    out.r = v
    out.g = v
    out.b = v
    return
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  out.r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255)
  out.g = Math.round(hue2rgb(p, q, h) * 255)
  out.b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

function clamp01(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}
