export type RGB = { r: number; g: number; b: number }
export type HSL = { h: number; s: number; l: number }
export type OKLCH = { l: number; c: number; h: number }

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n))

export function parseHex(hex: string): RGB | null {
  let s = hex.trim().replace(/^#/, '')
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  if (s.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(s)) return null
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  }
}

export function rgbToHex({ r, g, b }: RGB): string {
  const h = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  switch (max) {
    case rn:
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
      break
    case gn:
      h = ((bn - rn) / d + 2) * 60
      break
    default:
      h = ((rn - gn) / d + 4) * 60
  }
  return { h, s: s * 100, l: l * 100 }
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const sn = s / 100
  const ln = l / 100
  if (sn === 0) {
    const v = ln * 255
    return { r: v, g: v, b: v }
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn
  const p = 2 * ln - q
  const hue = ((h % 360) + 360) % 360 / 360
  const f = (t: number) => {
    let n = t
    if (n < 0) n += 1
    if (n > 1) n -= 1
    if (n < 1 / 6) return p + (q - p) * 6 * n
    if (n < 1 / 2) return q
    if (n < 2 / 3) return p + (q - p) * (2 / 3 - n) * 6
    return p
  }
  return {
    r: f(hue + 1 / 3) * 255,
    g: f(hue) * 255,
    b: f(hue - 1 / 3) * 255,
  }
}

export function formatRgb({ r, g, b }: RGB): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
}

export function formatHsl({ h, s, l }: HSL): string {
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`
}

export function parseRgb(input: string): RGB | null {
  const m = input.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (!m) return null
  return { r: +m[1], g: +m[2], b: +m[3] }
}

export function parseHsl(input: string): HSL | null {
  const m = input.match(/hsla?\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%?\s*,\s*(\d+(?:\.\d+)?)%?/i)
  if (!m) return null
  return { h: +m[1], s: +m[2], l: +m[3] }
}

// ---------- OKLCH (Björn Ottosson, 2020) ----------

function srgbToLinear(c: number): number {
  const n = c / 255
  return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4)
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return clamp(Math.round(v * 255), 0, 255)
}

function rgbToOklab({ r, g, b }: RGB): { L: number; a: number; b: number } {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  }
}

function oklabToRgb({ L, a, b }: { L: number; a: number; b: number }): RGB {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  return { r: linearToSrgb(lr), g: linearToSrgb(lg), b: linearToSrgb(lb) }
}

export function rgbToOklch(rgb: RGB): OKLCH {
  const { L, a, b } = rgbToOklab(rgb)
  const c = Math.hypot(a, b)
  let h = (Math.atan2(b, a) * 180) / Math.PI
  if (h < 0) h += 360
  return { l: L, c, h }
}

export function oklchToRgb({ l, c, h }: OKLCH): RGB {
  const rad = (h * Math.PI) / 180
  return oklabToRgb({ L: l, a: c * Math.cos(rad), b: c * Math.sin(rad) })
}

export function formatOklch({ l, c, h }: OKLCH): string {
  return `oklch(${(l * 100).toFixed(1)}% ${c.toFixed(3)} ${h.toFixed(1)})`
}

// ---------- WCAG contrast ----------

export function relativeLuminance({ r, g, b }: RGB): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [l1, l2] = la > lb ? [la, lb] : [lb, la]
  return (l1 + 0.05) / (l2 + 0.05)
}

// ---------- Palettes ----------

function withHue(rgb: RGB, dh: number): RGB {
  const hsl = rgbToHsl(rgb)
  return hslToRgb({ ...hsl, h: ((hsl.h + dh) % 360 + 360) % 360 })
}

export function paletteComplementary(rgb: RGB): RGB[] {
  return [rgb, withHue(rgb, 180)]
}

export function paletteAnalogous(rgb: RGB): RGB[] {
  return [withHue(rgb, -60), withHue(rgb, -30), rgb, withHue(rgb, 30), withHue(rgb, 60)]
}

export function paletteTriadic(rgb: RGB): RGB[] {
  return [rgb, withHue(rgb, 120), withHue(rgb, 240)]
}

export function paletteTints(rgb: RGB): RGB[] {
  // Mix with white in 5 steps from 0 -> ~0.8.
  return [0, 0.2, 0.4, 0.6, 0.8].map((m) => ({
    r: rgb.r + (255 - rgb.r) * m,
    g: rgb.g + (255 - rgb.g) * m,
    b: rgb.b + (255 - rgb.b) * m,
  }))
}

export function paletteShades(rgb: RGB): RGB[] {
  return [0, 0.2, 0.4, 0.6, 0.8].map((m) => ({
    r: rgb.r * (1 - m),
    g: rgb.g * (1 - m),
    b: rgb.b * (1 - m),
  }))
}
