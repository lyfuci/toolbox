/**
 * Selective Color adjustment (Photoshop Image > Adjustments > Selective
 * Color).
 *
 * The tool edits images in CMYK space but groups the edits by *which colors
 * they touch*: nine ranges — the six hue families (reds / yellows / greens /
 * cyans / blues / magentas) plus three tonal ranges (whites / neutrals /
 * blacks). For each range you nudge the cyan / magenta / yellow / black
 * components. A real photo's pixels rarely belong to exactly one range, so we
 * use a *soft membership* model: every pixel gets a 0..1 weight in each
 * range, and a range's CMYK deltas are applied scaled by that weight. The
 * effects of all nine ranges accumulate.
 *
 * Membership model
 * ----------------
 * Hue families: weight = hueProximity × saturation. `hueProximity` is the
 *   linear falloff (1 at the family's 60°-spaced center, 0 at the neighboring
 *   centers) so each pixel splits between its two nearest families. Multiplying
 *   by saturation means near-gray pixels barely register in any hue family
 *   (their color is better described by the tonal ranges).
 * Tonal ranges keyed off lightness L = (max+min)/2 in [0,1]:
 *   whites   = clamp01((L - 0.5) / 0.5)      → ramps 0→1 across the upper half
 *   blacks   = clamp01((0.5 - L) / 0.5)      → ramps 0→1 across the lower half
 *   neutrals = 1 - whites - blacks           → triangular peak at L = 0.5
 *   These are scaled by (1 - saturation): the tonal ranges describe the
 *   achromatic axis, so a vivid color contributes little to them.
 *
 * A pixel can belong to a hue family AND a tonal range simultaneously
 * (e.g. a bright, saturated red is in both `reds` and `whites`), which is how
 * PS behaves.
 *
 * Modes
 * -----
 * relative: the delta scales the *existing* component → `c += c · δ · w`.
 *   A range can't add a component that isn't there (zero stays zero), which
 *   makes it the gentle, photo-safe mode.
 * absolute: the delta is added outright → `c += δ · w`, letting you introduce
 *   a component from nothing.
 * (δ = range value / 100, w = membership weight.)
 *
 * Per-pixel transform — no neighborhood sampling, no radius. Mutates the RGBA
 * buffer in place; alpha untouched. When every delta is zero we skip the
 * pixel entirely so the default (all-zero) params are an exact identity and
 * don't accumulate RGB↔CMYK rounding error.
 */

export type SelectiveColorRange = {
  /** Each delta is a percentage in [-100, 100]. */
  c: number
  m: number
  y: number
  k: number
}

export type SelectiveColorParams = {
  kind: 'selectiveColor'
  mode: 'relative' | 'absolute'
  ranges: {
    reds: SelectiveColorRange
    yellows: SelectiveColorRange
    greens: SelectiveColorRange
    cyans: SelectiveColorRange
    blues: SelectiveColorRange
    magentas: SelectiveColorRange
    whites: SelectiveColorRange
    neutrals: SelectiveColorRange
    blacks: SelectiveColorRange
  }
}

const ZERO_RANGE: SelectiveColorRange = { c: 0, m: 0, y: 0, k: 0 }

export const DEFAULT_SELECTIVE_COLOR: SelectiveColorParams = {
  kind: 'selectiveColor',
  mode: 'relative',
  ranges: {
    reds: { ...ZERO_RANGE },
    yellows: { ...ZERO_RANGE },
    greens: { ...ZERO_RANGE },
    cyans: { ...ZERO_RANGE },
    blues: { ...ZERO_RANGE },
    magentas: { ...ZERO_RANGE },
    whites: { ...ZERO_RANGE },
    neutrals: { ...ZERO_RANGE },
    blacks: { ...ZERO_RANGE },
  },
}

export function applySelectiveColor(
  data: Uint8ClampedArray,
  params: SelectiveColorParams,
): void {
  const r = params.ranges
  const hueRanges = [r.reds, r.yellows, r.greens, r.cyans, r.blues, r.magentas]
  const relative = params.mode === 'relative'

  // If nothing is dialed in, the whole pass is a no-op. Short-circuiting here
  // keeps the default identity exact (no CMYK roundtrip rounding drift).
  if (!anyNonZero(params)) return

  const cmyk = { c: 0, m: 0, y: 0, k: 0 }
  const rgb = { r: 0, g: 0, b: 0 }

  for (let i = 0; i < data.length; i += 4) {
    const rr = data[i]
    const gg = data[i + 1]
    const bb = data[i + 2]

    const max = rr > gg ? (rr > bb ? rr : bb) : gg > bb ? gg : bb
    const min = rr < gg ? (rr < bb ? rr : bb) : gg < bb ? gg : bb
    const chroma = max - min
    const lightness = (max + min) / 2 / 255 // 0..1
    // HSL-style saturation: how far from the gray axis (0 = gray, 1 = vivid).
    const sat =
      chroma === 0
        ? 0
        : lightness > 0.5
          ? chroma / (510 - max - min)
          : chroma / (max + min)

    rgbToCmyk(rr, gg, bb, cmyk)
    let c = cmyk.c
    let m = cmyk.m
    let y = cmyk.y
    let k = cmyk.k

    // Hue-family memberships, weighted by saturation.
    if (chroma > 0) {
      const hue = hueDegrees(rr, gg, bb, max, chroma)
      const pos = hue / 60
      const lowIdx = Math.floor(pos) % 6
      const highIdx = (lowIdx + 1) % 6
      const frac = pos - Math.floor(pos)
      // Triangular split between the two nearest family centers.
      const lowW = (1 - frac) * sat
      const highW = frac * sat
      ;[c, m, y, k] = applyRange(hueRanges[lowIdx], lowW, c, m, y, k, relative)
      ;[c, m, y, k] = applyRange(hueRanges[highIdx], highW, c, m, y, k, relative)
    }

    // Tonal memberships, weighted toward the achromatic axis (1 - sat).
    const tonal = 1 - sat
    const whitesW = clamp01((lightness - 0.5) / 0.5) * tonal
    const blacksW = clamp01((0.5 - lightness) / 0.5) * tonal
    const neutralsW = clamp01(1 - clamp01((lightness - 0.5) / 0.5) - clamp01((0.5 - lightness) / 0.5)) * tonal
    ;[c, m, y, k] = applyRange(r.whites, whitesW, c, m, y, k, relative)
    ;[c, m, y, k] = applyRange(r.neutrals, neutralsW, c, m, y, k, relative)
    ;[c, m, y, k] = applyRange(r.blacks, blacksW, c, m, y, k, relative)

    cmykToRgb(c, m, y, k, rgb)
    data[i] = rgb.r
    data[i + 1] = rgb.g
    data[i + 2] = rgb.b
  }
}

/**
 * Apply one range's CMYK deltas at membership weight `w`, returning the new
 * CMYK tuple clamped to [0,1]. relative scales the existing component;
 * absolute adds the delta outright. Returns a tuple so the caller can chain
 * ranges without allocating an object per call.
 */
function applyRange(
  range: SelectiveColorRange,
  w: number,
  c: number,
  m: number,
  y: number,
  k: number,
  relative: boolean,
): [number, number, number, number] {
  if (w === 0) return [c, m, y, k]
  const dc = (range.c / 100) * w
  const dm = (range.m / 100) * w
  const dy = (range.y / 100) * w
  const dk = (range.k / 100) * w
  if (relative) {
    c = clamp01(c + c * dc)
    m = clamp01(m + m * dm)
    y = clamp01(y + y * dy)
    k = clamp01(k + k * dk)
  } else {
    c = clamp01(c + dc)
    m = clamp01(m + dm)
    y = clamp01(y + dy)
    k = clamp01(k + dk)
  }
  return [c, m, y, k]
}

/** True if any range carries a non-zero delta (used to skip identity passes). */
function anyNonZero(params: SelectiveColorParams): boolean {
  for (const key in params.ranges) {
    const rng = params.ranges[key as keyof SelectiveColorParams['ranges']]
    if (rng.c !== 0 || rng.m !== 0 || rng.y !== 0 || rng.k !== 0) return true
  }
  return false
}

/** Hue in degrees [0, 360) from RGB + precomputed max/chroma (chroma > 0). */
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

// ── CMYK helpers (local copy; this file stands alone) ──────────────────────

/**
 * RGB (0..255) → CMYK (each 0..1). Standard naive conversion:
 *   K = 1 - max/255, then C/M/Y are the residual of each channel after K.
 * Pure black (max = 0) yields K = 1 and C = M = Y = 0.
 */
function rgbToCmyk(
  r: number,
  g: number,
  b: number,
  out: { c: number; m: number; y: number; k: number },
): void {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const k = 1 - Math.max(rn, gn, bn)
  if (k >= 1) {
    out.c = 0
    out.m = 0
    out.y = 0
    out.k = 1
    return
  }
  const inv = 1 - k
  out.c = (1 - rn - k) / inv
  out.m = (1 - gn - k) / inv
  out.y = (1 - bn - k) / inv
  out.k = k
}

/** CMYK (each 0..1) → RGB (0..255 rounded). Inverse of `rgbToCmyk`. */
function cmykToRgb(
  c: number,
  m: number,
  y: number,
  k: number,
  out: { r: number; g: number; b: number },
): void {
  const inv = 1 - k
  out.r = Math.round(255 * (1 - c) * inv)
  out.g = Math.round(255 * (1 - m) * inv)
  out.b = Math.round(255 * (1 - y) * inv)
}

function clamp01(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}
