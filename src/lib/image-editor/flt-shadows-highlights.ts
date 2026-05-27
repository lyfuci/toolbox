/**
 * Shadows/Highlights — Photoshop's Image > Adjustments > Shadows/Highlights.
 *
 * WHY this is a *filter* (spatial), not a per-pixel *adjustment*: the effect's
 * defining quality is that it lifts shadows / recovers highlights *regionally*,
 * driven by the *local* tonality around each pixel rather than that single
 * pixel's value. A small dark detail sitting inside a bright region should not
 * get lifted as hard as the same value sitting inside a genuinely dark region.
 * Photoshop achieves this with a blurred "tonal mask"; we do the same. Because
 * we sample a neighbourhood (the blur), this needs width + height and must use
 * the FILTER signature (mutate `data` in place).
 *
 * Approach (local-tone-mask, a few O(w·h) passes):
 *   1. Per-pixel Rec.709 luminance → Float32Array `lum` in 0..1.
 *   2. A blurred copy `mask` of that luminance (separable box blur, 2 passes
 *      ≈ Gaussian) at `radius`. This blurred value is the *local tone
 *      reference*: it's what gives the effect its regional PS feel and avoids
 *      the flat, washed-out look of a plain global gamma curve. radius=0 skips
 *      the blur and uses the raw per-pixel luminance as the reference.
 *   3. Shadows: a smoothstep weight `sMask` that is ~1 where the local tone is
 *      dark and falls to 0 by the midtones. We lift each channel toward white
 *      (screen-like) by `shadowsAmount/100 * sMask`. Lifting toward 255 (rather
 *      than scaling up) means even pure black brightens and there's no
 *      divide-by-zero on dark pixels.
 *   4. Highlights: the symmetric `hMask` (~1 in highlights, 0 by midtones)
 *      pulls each channel down (multiply-like) by `highlightsAmount/100 * hMask`.
 *      Pure white still darkens.
 *   5. Colour preservation: applying the *same* mask-weighted gain to each RGB
 *      channel keeps the channel ratios — and therefore hue — structurally
 *      intact, so we don't need a separate hue-restore pass. Alpha is untouched.
 *
 * This is a faithful-but-simplified Shadows/Highlights: v1 exposes only
 * amount + radius. Photoshop's extra "Tonal Width" (how far up the tonal range
 * each correction reaches) and "Color Correction" (saturation comp) knobs are
 * intentionally omitted — the smoothstep band width and per-channel gain stand
 * in for them.
 */

export type ShadowsHighlightsParams = {
  kind: 'shadowsHighlights'
  /** 0..100 — how much to lift shadows. */
  shadowsAmount: number
  /** 0..100 — how much to recover (darken) highlights. */
  highlightsAmount: number
  /** Preview-canvas px — blur radius of the tonal mask. Bake-scaled. */
  radius: number
}

export const DEFAULT_SHADOWS_HIGHLIGHTS: ShadowsHighlightsParams = {
  kind: 'shadowsHighlights',
  shadowsAmount: 35,
  highlightsAmount: 0,
  radius: 30,
}

/**
 * Hermite smoothstep: 0 at `edge0`, 1 at `edge1`, smooth (C¹) in between.
 * `edge0 > edge1` is allowed and simply reverses the ramp — we use that to get
 * the "high at low luminance" shadows mask without a separate `1 - x`.
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  let t = (x - edge0) / (edge1 - edge0)
  if (t < 0) t = 0
  else if (t > 1) t = 1
  return t * t * (3 - 2 * t)
}

/**
 * In-place separable box blur of a single-channel Float32 field. One call does
 * a horizontal then a vertical pass with clamp-to-edge borders. We run it twice
 * from the caller so two box passes approximate a Gaussian (central-limit), giving
 * a smooth tonal mask without the cost of a true Gaussian kernel.
 */
function boxBlur1D(
  field: Float32Array,
  w: number,
  h: number,
  radius: number,
  tmp: Float32Array,
): void {
  const win = radius * 2 + 1
  const inv = 1 / win
  // Horizontal: field -> tmp.
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) {
        let xi = x + k
        if (xi < 0) xi = 0
        else if (xi >= w) xi = w - 1
        sum += field[row + xi]
      }
      tmp[row + x] = sum * inv
    }
  }
  // Vertical: tmp -> field.
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) {
        let yi = y + k
        if (yi < 0) yi = 0
        else if (yi >= h) yi = h - 1
        sum += tmp[yi * w + x]
      }
      field[y * w + x] = sum * inv
    }
  }
}

export function applyShadowsHighlights(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: ShadowsHighlightsParams,
): void {
  const sAmt = Math.max(0, Math.min(100, params.shadowsAmount)) / 100
  const hAmt = Math.max(0, Math.min(100, params.highlightsAmount)) / 100
  if (sAmt === 0 && hAmt === 0) return

  const n = width * height

  // 1) Per-pixel Rec.709 luminance in 0..1. This is the tonal-mask source.
  const lum = new Float32Array(n)
  for (let i = 0, p = 0; p < n; i += 4, p++) {
    lum[p] =
      (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255
  }

  // 2) Blurred copy = the *local tone reference*. radius=0 means "no
  //    neighbourhood" — fall back to the raw per-pixel luminance so the filter
  //    still runs (and degrades to a per-pixel tone curve) instead of feeding 0
  //    into a blur that assumes radius >= 1.
  const r = Math.round(params.radius)
  let mask: Float32Array
  if (r >= 1) {
    mask = new Float32Array(lum) // copy; we blur the copy, keep `lum` per-pixel.
    const tmp = new Float32Array(n)
    boxBlur1D(mask, width, height, r, tmp)
    boxBlur1D(mask, width, height, r, tmp) // 2 passes ≈ Gaussian.
  } else {
    mask = lum
  }

  // 3 + 4) Apply the regional tone change, weighted by the smoothstep masks.
  //   sMask ~1 in shadows (low local tone), 0 by the midtones.
  //   hMask ~1 in highlights (high local tone), 0 by the midtones.
  for (let i = 0, p = 0; p < n; i += 4, p++) {
    const lb = mask[p]

    if (sAmt > 0) {
      const sMask = smoothstep(0.5, 0.0, lb) // reversed ramp: high when dark.
      if (sMask > 0) {
        const lift = sAmt * sMask
        // Screen-like lift toward white: keeps channel ratios → hue stable.
        data[i] = data[i] + (255 - data[i]) * lift
        data[i + 1] = data[i + 1] + (255 - data[i + 1]) * lift
        data[i + 2] = data[i + 2] + (255 - data[i + 2]) * lift
      }
    }

    if (hAmt > 0) {
      const hMask = smoothstep(0.5, 1.0, lb) // high when bright.
      if (hMask > 0) {
        const pull = hAmt * hMask
        // Multiply-like pull toward black: same gain per channel → hue stable.
        data[i] = data[i] * (1 - pull)
        data[i + 1] = data[i + 1] * (1 - pull)
        data[i + 2] = data[i + 2] * (1 - pull)
      }
    }
    // Alpha (data[i + 3]) deliberately untouched.
  }
}
