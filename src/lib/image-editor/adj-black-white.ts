/**
 * Black & White adjustment (Photoshop Image > Adjustments > Black & White).
 *
 * Unlike a flat desaturate, PS's B&W lets each of the six hue families
 * (reds / yellows / greens / cyans / blues / magentas) contribute a
 * different amount of *lightness* to the resulting gray. That's why a red
 * apple and a green leaf of equal luminance can be pushed to very different
 * grays. We model this directly: a pixel's chromatic component
 * (`max(R,G,B) - min(R,G,B)`) is scaled by a slider weight chosen from the
 * pixel's hue, then added back onto the achromatic floor (`min`).
 *
 * Each slider is a percentage where 100 = "pass the chroma through
 * unchanged" (neutral). >100 lifts that family toward white, <100 pushes it
 * toward black. PS's range is -200..300 which, with this model, lets pure
 * hues reach full black (slider <= 0) or full white (slider >= 100 once the
 * chroma already fills the headroom). The default mix (reds 40, yellows 60,
 * …) reproduces PS's "Default" preset character.
 *
 * Optional `tint` re-colors the gray: the gray becomes the *lightness* of an
 * HSL color at (`tintHue`, `tintSat`%), giving sepia / duotone looks. When
 * `tint` is false the output is a true neutral gray (R=G=B) and `tintHue` /
 * `tintSat` are ignored.
 *
 * This is a per-pixel transform — no neighborhood sampling, no radius — so it
 * mutates the RGBA buffer in place and leaves alpha untouched.
 */

export type BlackWhiteParams = {
  kind: 'blackWhite'
  /** Per-family lightness weights, each a percentage in [-200, 300]; 100 = neutral. */
  reds: number
  yellows: number
  greens: number
  cyans: number
  blues: number
  magentas: number
  /** Apply a color tint to the gray (sepia / duotone). */
  tint: boolean
  /** Tint hue in degrees [0, 360]; only used when `tint`. */
  tintHue: number
  /** Tint saturation in percent [0, 100]; only used when `tint`. */
  tintSat: number
}

export const DEFAULT_BLACK_WHITE: BlackWhiteParams = {
  kind: 'blackWhite',
  reds: 40,
  yellows: 60,
  greens: 40,
  cyans: 60,
  blues: 20,
  magentas: 80,
  tint: false,
  tintHue: 42,
  tintSat: 25,
}

/**
 * The hue wheel is partitioned into six 60°-wide arcs centered on the family
 * hues (reds 0°, yellows 60°, greens 120°, cyans 180°, blues 240°,
 * magentas 300°). A pixel's hue is linearly blended between the two nearest
 * centers (via `hue / 60`) so the weighting is continuous — no hard banding
 * at family boundaries.
 */
export function applyBlackWhite(
  data: Uint8ClampedArray,
  params: BlackWhiteParams,
): void {
  // Index-aligned with the family hue arcs: reds, yellows, greens, cyans, blues, magentas.
  const weights = [
    params.reds,
    params.yellows,
    params.greens,
    params.cyans,
    params.blues,
    params.magentas,
  ]

  const tintRgb = { r: 0, g: 0, b: 0 }

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    const max = r > g ? (r > b ? r : b) : g > b ? g : b
    const min = r < g ? (r < b ? r : b) : g < b ? g : b
    const chroma = max - min

    // Blend the two adjacent family sliders by where the hue lands in its
    // 60° arc. A fully achromatic pixel (chroma 0) has no defined hue, so its
    // weight collapses to the neutral 100% — it stays at its own lightness.
    let weight = 100
    if (chroma > 0) {
      const hue = hueDegrees(r, g, b, max, chroma)
      const pos = hue / 60 // 0..6 around the wheel
      const lowIdx = Math.floor(pos) % 6
      const highIdx = (lowIdx + 1) % 6
      const frac = pos - Math.floor(pos)
      weight = weights[lowIdx] * (1 - frac) + weights[highIdx] * frac
    }

    // gray = achromatic floor + scaled chroma. weight/100 == 1 is a no-op on
    // the chroma; >1 lifts toward white, <=0 collapses to the floor (and the
    // floor itself is low for saturated colors, so deep blacks are reachable).
    let gray = min + chroma * (weight / 100)
    gray = gray < 0 ? 0 : gray > 255 ? 255 : gray

    if (params.tint) {
      // gray drives lightness of a fixed-hue/sat color.
      const h = (((params.tintHue % 360) + 360) % 360) / 360
      const s = clamp01(params.tintSat / 100)
      hslToRgb(h, s, gray / 255, tintRgb)
      data[i] = tintRgb.r
      data[i + 1] = tintRgb.g
      data[i + 2] = tintRgb.b
    } else {
      const v = Math.round(gray)
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
    }
  }
}

/**
 * Hue in degrees [0, 360) from RGB plus its precomputed max/chroma.
 * Standard HSV hue derivation; chroma is assumed > 0 by the caller.
 */
function hueDegrees(
  r: number,
  g: number,
  b: number,
  max: number,
  chroma: number,
): number {
  let h: number
  if (max === r) h = ((g - b) / chroma) % 6
  else if (max === g) h = (b - r) / chroma + 2
  else h = (r - g) / chroma + 4
  h *= 60
  if (h < 0) h += 360
  return h
}

// ── Color-space helpers (local copy; adjustments.ts keeps its private) ─────

/**
 * HSL → RGB (0..255 rounded). `h`, `s`, `l` are all in [0, 1]. Mirrors the
 * conventional algorithm; isolated here so this file has no cross-module
 * dependency on the editor's other adjustments.
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
