import type { ColorLookupParams, ColorLookupPreset } from './types'

/**
 * Color Lookup (PS Image > Adjustments > Color Lookup) — a one-click color
 * grade picked from a set of named looks, blended over the original by
 * `intensity` (exactly how PS's Color Lookup acts as an opacity-controlled
 * adjustment layer).
 *
 * WHY PROCEDURAL, NOT A STORED LUT: Photoshop drives this from `.cube`/`.3dl`
 * 3D-LUT files. A full 33³ LUT is ~36k entries (~0.5–1 MB) and our params live
 * inside every history snapshot (kept by reference) and every serialized
 * project (`JSON.stringify`) — embedding a LUT there would bloat undo/redo and
 * project files. So instead each preset is an ORIGINAL, royalty-free per-pixel
 * transform computed on the fly; the stored param is just a tiny `preset` key.
 * (Loading user `.cube` files — with deliberate downsampling to keep them
 * small — is a natural follow-up that can reuse `applyColorLookup`'s blend.)
 *
 * Each look is a `Grade` that maps an RGB triple to a graded triple; the apply
 * pass then lerps original→graded by `intensity/100`. Grades write into a
 * caller-provided scratch array so the hot loop allocates nothing per pixel.
 * Alpha is never touched.
 */

export const DEFAULT_COLOR_LOOKUP: ColorLookupParams = {
  kind: 'colorLookup',
  preset: 'tealOrange',
  intensity: 100,
}

/** All eight built-in look keys, in dropdown order. */
export const COLOR_LOOKUP_PRESETS: ColorLookupPreset[] = [
  'tealOrange',
  'warm',
  'cool',
  'vintageFilm',
  'bwFilm',
  'sepiaTone',
  'punch',
  'fade',
]

type Grade = (r: number, g: number, b: number, out: number[]) => void

const clamp = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v)
const luma = (r: number, g: number, b: number): number =>
  0.299 * r + 0.587 * g + 0.114 * b
/** Contrast pivot around mid-grey (128); `amt` > 1 steepens. */
const contrast = (v: number, amt: number): number => (v - 128) * amt + 128
/** Hermite smoothstep, clamped to [0,1]. */
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

const GRADES: Record<ColorLookupPreset, Grade> = {
  // Cinematic split-tone: teal pushed into the shadows, orange into the
  // highlights — the modern blockbuster look.
  tealOrange: (r, g, b, out) => {
    const L = luma(r, g, b) / 255
    const sh = 1 - smoothstep(0, 0.5, L) // shadow weight
    const hi = smoothstep(0.5, 1, L) // highlight weight
    out[0] = clamp(contrast(r + hi * 28 - sh * 12, 1.06))
    out[1] = clamp(contrast(g + hi * 10 + sh * 6, 1.06))
    out[2] = clamp(contrast(b - hi * 22 + sh * 26, 1.06))
  },
  // Golden-hour warmth.
  warm: (r, g, b, out) => {
    out[0] = clamp(r * 1.07 + 8)
    out[1] = clamp(g * 1.02 + 2)
    out[2] = clamp(b * 0.9)
  },
  // Cool blue cast.
  cool: (r, g, b, out) => {
    out[0] = clamp(r * 0.9)
    out[1] = clamp(g + 2)
    out[2] = clamp(b * 1.08 + 8)
  },
  // Warm faded-matte film: lifted blacks, pulled highlights, gentle desaturate.
  vintageFilm: (r, g, b, out) => {
    const lift = 22
    const top = 0.82
    let nr = r * top + lift + 10
    let ng = g * top + lift * 0.95 + 4
    let nb = b * top + lift * 0.8 - 6
    const L = luma(nr, ng, nb)
    const d = 0.15
    nr = nr * (1 - d) + L * d
    ng = ng * (1 - d) + L * d
    nb = nb * (1 - d) + L * d
    out[0] = clamp(nr)
    out[1] = clamp(ng)
    out[2] = clamp(nb)
  },
  // Neutral black-and-white with a filmic contrast bump.
  bwFilm: (r, g, b, out) => {
    const L = clamp(contrast(luma(r, g, b), 1.18))
    out[0] = L
    out[1] = L
    out[2] = L
  },
  // Warm sepia monochrome.
  sepiaTone: (r, g, b, out) => {
    const L = contrast(luma(r, g, b), 1.08)
    out[0] = clamp(L + 32)
    out[1] = clamp(L * 0.85 + 14)
    out[2] = clamp(L * 0.58)
  },
  // High-contrast, high-vibrance "punch".
  punch: (r, g, b, out) => {
    let nr = contrast(r, 1.25)
    let ng = contrast(g, 1.25)
    let nb = contrast(b, 1.25)
    const L = luma(nr, ng, nb)
    const s = 1.25 // saturation push: scale distance from luma
    nr = L + (nr - L) * s
    ng = L + (ng - L) * s
    nb = L + (nb - L) * s
    out[0] = clamp(nr)
    out[1] = clamp(ng)
    out[2] = clamp(nb)
  },
  // Neutral/cool faded matte (the cool counterpart to vintageFilm).
  fade: (r, g, b, out) => {
    const lift = 26
    const top = 0.8
    let nr = r * top + lift - 4
    let ng = g * top + lift
    let nb = b * top + lift + 8
    const L = luma(nr, ng, nb)
    const d = 0.2
    nr = nr * (1 - d) + L * d
    ng = ng * (1 - d) + L * d
    nb = nb * (1 - d) + L * d
    out[0] = clamp(nr)
    out[1] = clamp(ng)
    out[2] = clamp(nb)
  },
}

export function applyColorLookup(
  data: Uint8ClampedArray,
  params: ColorLookupParams,
): void {
  const grade = GRADES[params.preset] ?? GRADES.tealOrange
  const amt = Math.max(0, Math.min(100, params.intensity)) / 100
  if (amt === 0) return // fully transparent grade → no-op

  const out = [0, 0, 0]
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    grade(r, g, b, out)
    data[i] = r + (out[0] - r) * amt
    data[i + 1] = g + (out[1] - g) * amt
    data[i + 2] = b + (out[2] - b) * amt
    // alpha (data[i + 3]) intentionally left untouched
  }
}
