export type RGB = { r: number; g: number; b: number }
export type HSL = { h: number; s: number; l: number }

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
