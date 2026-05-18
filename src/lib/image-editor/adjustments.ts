import type {
  AdjustmentParams,
  BrightnessContrastParams,
  ChannelMixerParams,
  ColorBalanceParams,
  CurvesParams,
  ExposureParams,
  HueSaturationParams,
  InvertParams,
  LevelsParams,
  PosterizeParams,
  ThresholdParams,
  VibranceParams,
} from './types'

/**
 * In-place pixel transforms backing each AdjustmentLayer kind. All operate on
 * RGBA `Uint8ClampedArray` data (the format `ImageData.data` returns) and
 * leave alpha untouched.
 *
 * For per-channel-LUT adjustments (levels / curves / posterize /
 * brightnessContrast / exposure / invert) we precompute a 256-entry lookup
 * table once and reuse it across every pixel — orders of magnitude faster
 * than evaluating the math per-pixel for a typical image.
 *
 * For HSL-based adjustments (hueSaturation / vibrance) we go pixel-by-pixel
 * through RGB↔HSL — there's no LUT shortcut since the transform depends on
 * the full RGB triple (its hue + saturation), not a single channel.
 */

export const DEFAULT_LEVELS: LevelsParams = {
  kind: 'levels',
  inputBlack: 0,
  inputWhite: 255,
  gamma: 1,
  outputBlack: 0,
  outputWhite: 255,
}
export const DEFAULT_CURVES: CurvesParams = {
  kind: 'curves',
  points: [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ],
}
export const DEFAULT_POSTERIZE: PosterizeParams = {
  kind: 'posterize',
  levels: 4,
}
export const DEFAULT_THRESHOLD: ThresholdParams = {
  kind: 'threshold',
  threshold: 128,
}
export const DEFAULT_BRIGHTNESS_CONTRAST: BrightnessContrastParams = {
  kind: 'brightnessContrast',
  brightness: 0,
  contrast: 0,
}
export const DEFAULT_HUE_SATURATION: HueSaturationParams = {
  kind: 'hueSaturation',
  hue: 0,
  saturation: 0,
  lightness: 0,
}
export const DEFAULT_COLOR_BALANCE: ColorBalanceParams = {
  kind: 'colorBalance',
  cyanRed: 0,
  magentaGreen: 0,
  yellowBlue: 0,
}
export const DEFAULT_INVERT: InvertParams = { kind: 'invert' }
export const DEFAULT_VIBRANCE: VibranceParams = {
  kind: 'vibrance',
  vibrance: 0,
  saturation: 0,
}
export const DEFAULT_EXPOSURE: ExposureParams = {
  kind: 'exposure',
  exposure: 0,
  offset: 0,
  gamma: 1,
}
export const DEFAULT_CHANNEL_MIXER: ChannelMixerParams = {
  kind: 'channelMixer',
  rOutR: 100, rOutG: 0, rOutB: 0, rConstant: 0,
  gOutR: 0, gOutG: 100, gOutB: 0, gConstant: 0,
  bOutR: 0, bOutG: 0, bOutB: 100, bConstant: 0,
}

export const DEFAULT_FOR_KIND: Record<
  AdjustmentParams['kind'],
  AdjustmentParams
> = {
  levels: DEFAULT_LEVELS,
  curves: DEFAULT_CURVES,
  posterize: DEFAULT_POSTERIZE,
  threshold: DEFAULT_THRESHOLD,
  brightnessContrast: DEFAULT_BRIGHTNESS_CONTRAST,
  hueSaturation: DEFAULT_HUE_SATURATION,
  colorBalance: DEFAULT_COLOR_BALANCE,
  invert: DEFAULT_INVERT,
  vibrance: DEFAULT_VIBRANCE,
  exposure: DEFAULT_EXPOSURE,
  channelMixer: DEFAULT_CHANNEL_MIXER,
}

export function applyAdjustment(
  data: Uint8ClampedArray,
  params: AdjustmentParams,
): void {
  switch (params.kind) {
    case 'levels':
      applyLut(data, levelsLut(params))
      return
    case 'curves':
      applyLut(data, curvesLut(params))
      return
    case 'posterize':
      applyLut(data, posterizeLut(params))
      return
    case 'threshold':
      applyThreshold(data, params)
      return
    case 'brightnessContrast':
      applyLut(data, brightnessContrastLut(params))
      return
    case 'hueSaturation':
      applyHueSaturation(data, params)
      return
    case 'colorBalance':
      applyColorBalance(data, params)
      return
    case 'invert':
      applyLut(data, invertLut())
      return
    case 'vibrance':
      applyVibrance(data, params)
      return
    case 'exposure':
      applyLut(data, exposureLut(params))
      return
    case 'channelMixer':
      applyChannelMixer(data, params)
      return
  }
}

/**
 * Channel Mixer — for each pixel, recompute (R, G, B) as a weighted sum
 * of the input (R, G, B) plus an additive constant. Weights are
 * percentages; identity = (100, 0, 0, 0) for R-out, etc.
 *
 *   r' = (rOutR * r + rOutG * g + rOutB * b) / 100 + rConstant * 1.28
 */
function applyChannelMixer(data: Uint8ClampedArray, p: ChannelMixerParams): void {
  const rR = p.rOutR / 100, rG = p.rOutG / 100, rB = p.rOutB / 100, rC = p.rConstant * 1.28
  const gR = p.gOutR / 100, gG = p.gOutG / 100, gB = p.gOutB / 100, gC = p.gConstant * 1.28
  const bR = p.bOutR / 100, bG = p.bOutG / 100, bB = p.bOutB / 100, bC = p.bConstant * 1.28
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    data[i] = clamp255(r * rR + g * rG + b * rB + rC)
    data[i + 1] = clamp255(r * gR + g * gG + b * gB + gC)
    data[i + 2] = clamp255(r * bR + g * bG + b * bB + bC)
  }
}


// ── Per-pixel runners ────────────────────────────────────────────────────

function applyLut(data: Uint8ClampedArray, lut: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]]
    data[i + 1] = lut[data[i + 1]]
    data[i + 2] = lut[data[i + 2]]
  }
}

function applyThreshold(data: Uint8ClampedArray, p: ThresholdParams): void {
  const t = clamp255(p.threshold)
  // ITU-R BT.601 luma — matches the standard PS Threshold weighting.
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
    const v = lum < t ? 0 : 255
    data[i] = v
    data[i + 1] = v
    data[i + 2] = v
  }
}

function applyHueSaturation(
  data: Uint8ClampedArray,
  p: HueSaturationParams,
): void {
  const dh = (((p.hue % 360) + 360) % 360) / 360 // 0..1
  const ds = p.saturation / 100 // -1..1
  const dl = p.lightness / 100
  const hsl = { h: 0, s: 0, l: 0 }
  const rgb = { r: 0, g: 0, b: 0 }
  for (let i = 0; i < data.length; i += 4) {
    rgbToHsl(data[i], data[i + 1], data[i + 2], hsl)
    let h = hsl.h + dh
    if (h >= 1) h -= 1
    let s = ds >= 0 ? hsl.s + (1 - hsl.s) * ds : hsl.s * (1 + ds)
    let l = dl >= 0 ? hsl.l + (1 - hsl.l) * dl : hsl.l * (1 + dl)
    s = clamp01(s)
    l = clamp01(l)
    hslToRgb(h, s, l, rgb)
    data[i] = rgb.r
    data[i + 1] = rgb.g
    data[i + 2] = rgb.b
  }
}

function applyColorBalance(
  data: Uint8ClampedArray,
  p: ColorBalanceParams,
): void {
  // Simple additive shift; PS splits this into shadow/midtone/highlight bands
  // but a flat shift gives the same broad-strokes color cast and keeps the
  // implementation small. Each axis: positive = first colour, negative = second.
  const dr = p.cyanRed * 1.27 // 100 → ~127, plenty of headroom
  const dg = p.magentaGreen * 1.27
  const db = p.yellowBlue * 1.27
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp255(data[i] + dr)
    data[i + 1] = clamp255(data[i + 1] + dg)
    data[i + 2] = clamp255(data[i + 2] + db)
  }
}

function applyVibrance(data: Uint8ClampedArray, p: VibranceParams): void {
  // Vibrance approximation: protect already-saturated pixels by scaling the
  // boost with (1 - currentSat). Saturation is a flat multiplier on top.
  const v = p.vibrance / 100
  const s = p.saturation / 100
  const hsl = { h: 0, s: 0, l: 0 }
  const rgb = { r: 0, g: 0, b: 0 }
  for (let i = 0; i < data.length; i += 4) {
    rgbToHsl(data[i], data[i + 1], data[i + 2], hsl)
    const protection = 1 - hsl.s
    let ns = hsl.s + v * protection
    ns = s >= 0 ? ns + (1 - ns) * s : ns * (1 + s)
    ns = clamp01(ns)
    hslToRgb(hsl.h, ns, hsl.l, rgb)
    data[i] = rgb.r
    data[i + 1] = rgb.g
    data[i + 2] = rgb.b
  }
}

// ── LUT builders ─────────────────────────────────────────────────────────

function levelsLut(p: LevelsParams): Uint8ClampedArray {
  const inB = clamp255(p.inputBlack)
  const inW = clamp255(p.inputWhite)
  const inRange = inW - inB || 1
  const invGamma = 1 / Math.max(0.01, p.gamma)
  const outB = clamp255(p.outputBlack)
  const outW = clamp255(p.outputWhite)
  const outRange = outW - outB
  const lut = new Uint8ClampedArray(256)
  for (let i = 0; i < 256; i++) {
    let v = (i - inB) / inRange
    if (v < 0) v = 0
    else if (v > 1) v = 1
    v = Math.pow(v, invGamma)
    lut[i] = Math.round(v * outRange + outB)
  }
  return lut
}

function curvesLut(p: CurvesParams): Uint8ClampedArray {
  // Sort + clamp + endpoint-pad the points so the LUT covers [0, 255] cleanly.
  const pts = [...p.points]
    .map((pt) => ({ x: clamp255(pt.x), y: clamp255(pt.y) }))
    .sort((a, b) => a.x - b.x)
  if (pts.length === 0 || pts[0].x > 0) pts.unshift({ x: 0, y: pts[0]?.y ?? 0 })
  if (pts[pts.length - 1].x < 255)
    pts.push({ x: 255, y: pts[pts.length - 1].y })
  const lut = new Uint8ClampedArray(256)
  // Catmull-Rom interpolation across consecutive segments. With <= 2 points we
  // degrade to a linear ramp — no free control points to bend the curve.
  for (let x = 0; x < 256; x++) {
    let i = 0
    while (i < pts.length - 1 && pts[i + 1].x < x) i++
    const p1 = pts[i]
    const p2 = pts[Math.min(i + 1, pts.length - 1)]
    if (p1.x === p2.x) {
      lut[x] = clamp255(p1.y)
      continue
    }
    if (pts.length <= 2) {
      const t = (x - p1.x) / (p2.x - p1.x)
      lut[x] = clamp255(p1.y + (p2.y - p1.y) * t)
      continue
    }
    const p0 = pts[Math.max(0, i - 1)]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const t = (x - p1.x) / (p2.x - p1.x)
    const t2 = t * t
    const t3 = t2 * t
    // Catmull-Rom (uniform). y is what matters; x is monotonic by sort.
    const y =
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    lut[x] = clamp255(y)
  }
  return lut
}

function posterizeLut(p: PosterizeParams): Uint8ClampedArray {
  const levels = Math.max(2, Math.min(32, Math.floor(p.levels)))
  const lut = new Uint8ClampedArray(256)
  for (let i = 0; i < 256; i++) {
    const bin = Math.min(levels - 1, Math.floor((i / 256) * levels))
    lut[i] = Math.round((bin / (levels - 1)) * 255)
  }
  return lut
}

function brightnessContrastLut(p: BrightnessContrastParams): Uint8ClampedArray {
  // Brightness: shift in 0..255. Contrast: scale around 128 with a
  // mild non-linear curve so 100% doesn't clamp everything to black/white.
  const b = (p.brightness / 100) * 127
  const c = Math.tan(((p.contrast / 100) * Math.PI) / 4 + Math.PI / 4)
  const lut = new Uint8ClampedArray(256)
  for (let i = 0; i < 256; i++) {
    lut[i] = clamp255((i - 128) * c + 128 + b)
  }
  return lut
}

function exposureLut(p: ExposureParams): Uint8ClampedArray {
  const gain = Math.pow(2, p.exposure)
  const offset = p.offset * 255
  const invGamma = 1 / Math.max(0.01, p.gamma)
  const lut = new Uint8ClampedArray(256)
  for (let i = 0; i < 256; i++) {
    let v = i * gain + offset
    v = clamp255(v) / 255
    v = Math.pow(v, invGamma)
    lut[i] = Math.round(v * 255)
  }
  return lut
}

function invertLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256)
  for (let i = 0; i < 256; i++) lut[i] = 255 - i
  return lut
}

// ── Color-space helpers ──────────────────────────────────────────────────

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

function clamp255(n: number): number {
  if (n < 0) return 0
  if (n > 255) return 255
  return n
}
