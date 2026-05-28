import type { TextWarp, TextWarpStyle } from './types'

/**
 * Warp Text envelope math + the bitmap remap (Photoshop Type > Warp Text).
 *
 * MODEL — vertical envelope. For horizontal text, every PS warp shape is a
 * deformation in which each vertical COLUMN of the rendered text keeps its x
 * but is bent/stretched vertically. So we model a warp as two per-column edge
 * curves over u ∈ [0,1] (u = horizontal position across the text width): the
 * top edge `top(u)` and bottom edge `bot(u)`, in units of the text height
 * (unwarped band = top 0 → bot 1). The pixel pass then INVERSE-samples: for
 * each output pixel it finds which column u it's in, where that column's warped
 * band sits, and reads the matching source row. Because the remap is vertical-
 * only (source x = output x) the inverse is a trivial 1-D solve — no 2-D mesh.
 *
 * This is why "horizontal distortion" here is a left/right ASYMMETRY of the
 * envelope (still a function of u), NOT PS's true horizontal perspective: real
 * horizontal perspective makes x depend on the row, which would force a 2-D
 * inversion. The vertical-envelope model faithfully covers arc/bulge/flag/
 * wave/rise/fish/inflate, which is the popular set.
 */

export const WARP_STYLES: TextWarpStyle[] = [
  'none',
  'arc',
  'bulge',
  'flag',
  'wave',
  'rise',
  'fish',
  'inflate',
]

/** True when the warp would visibly change the text (else render plain). */
export function isWarpActive(warp: TextWarp | undefined): warp is TextWarp {
  return (
    !!warp &&
    warp.style !== 'none' &&
    (warp.bend !== 0 || warp.horizontal !== 0 || warp.vertical !== 0)
  )
}

/**
 * Top/bottom edge of the warped band for the column at `u` ∈ [0,1]. The
 * unwarped band is { top: 0, bot: 1 } (units of text height). `bend`,
 * `horizontal`, `vertical` are the raw -100..100 params.
 */
export function warpEdges(
  style: TextWarpStyle,
  u: number,
  bend: number,
  horizontal: number,
  vertical: number,
): { top: number; bot: number } {
  const B = Math.max(-1, Math.min(1, bend / 100))
  const Hd = Math.max(-1, Math.min(1, horizontal / 100))
  const Vd = Math.max(-1, Math.min(1, vertical / 100))
  // 'none' is a true no-op — horizontal/vertical distortion are part of a warp,
  // so with no style there is nothing to distort.
  if (style === 'none') return { top: 0, bot: 1 }

  const t = 2 * u - 1 // -1..1
  const p = 1 - t * t // parabola: 1 at centre, 0 at ends

  let top = 0
  let bot = 1
  switch (style) {
    case 'arc': {
      // Constant thickness, band bows (centre rises for B>0).
      const s = -0.6 * B * p
      top = s
      bot = 1 + s
      break
    }
    case 'bulge': {
      // Thicker in the middle (top up, bottom down).
      const d = 0.5 * B * p
      top = -d
      bot = 1 + d
      break
    }
    case 'flag': {
      // Constant-thickness sine wave.
      const s = 0.5 * B * Math.sin(Math.PI * 2 * u)
      top = s
      bot = 1 + s
      break
    }
    case 'wave': {
      // Two-frequency ribbon — wavier than flag.
      const s =
        B * (0.3 * Math.sin(Math.PI * 2 * u) + 0.18 * Math.sin(Math.PI * 5 * u))
      top = s
      bot = 1 + s
      break
    }
    case 'rise': {
      // Diagonal shear — text rises toward the right for B>0.
      const s = -0.6 * B * u
      top = s
      bot = 1 + s
      break
    }
    case 'fish': {
      // Triangular taper — thick centre, pointed ends (fish/diamond).
      const d = 0.5 * B * (1 - Math.abs(t))
      top = -d
      bot = 1 + d
      break
    }
    case 'inflate': {
      // Expand everywhere, rounder in the middle.
      const d = 0.5 * B * (0.35 + 0.65 * p)
      top = -d
      bot = 1 + d
      break
    }
  }

  // Horizontal distortion → left/right asymmetry: scale the deviation from the
  // flat band by a u-dependent factor (clamped ≥ 0 so edges can't cross).
  if (Hd !== 0) {
    const asym = Math.max(0, 1 + Hd * t)
    top = top * asym
    bot = 1 + (bot - 1) * asym
  }
  // Vertical distortion → linear tilt of the whole band.
  if (Vd !== 0) {
    const tilt = Vd * 0.4 * t
    top += tilt
    bot += tilt
  }
  return { top, bot }
}

/**
 * Remap a rendered-text RGBA bitmap through the warp envelope. The text band
 * occupies x ∈ [padX, padX+textW], y ∈ [padY, padY+textH] in `src`; the rest is
 * transparent padding that gives the warped band room to overflow. Returns a
 * NEW RGBA array of the same W×H; pixels outside the warped band are
 * transparent. Pure (no DOM) so it's node-testable — the canvas glue lives in
 * drawing.ts.
 */
export function warpTextPixels(
  src: Uint8ClampedArray,
  W: number,
  H: number,
  warp: TextWarp,
  padX: number,
  padY: number,
  textW: number,
  textH: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length) // all-zero = transparent
  if (textW <= 0 || textH <= 0 || W === 0 || H === 0) {
    out.set(src)
    return out
  }

  // Bilinear sample of `src` at (fx, fy); out-of-bounds reads as transparent.
  const sample = (fx: number, fy: number, di: number) => {
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const x1 = x0 + 1
    const y1 = y0 + 1
    const wx = fx - x0
    const wy = fy - y0
    let r = 0
    let g = 0
    let b = 0
    let a = 0
    const acc = (px: number, py: number, w: number) => {
      if (px < 0 || px >= W || py < 0 || py >= H || w === 0) return
      const i = (py * W + px) * 4
      const sa = src[i + 3] * w
      r += src[i] * sa
      g += src[i + 1] * sa
      b += src[i + 2] * sa
      a += sa
    }
    // Premultiply by alpha so transparent texels don't darken glyph edges.
    acc(x0, y0, (1 - wx) * (1 - wy))
    acc(x1, y0, wx * (1 - wy))
    acc(x0, y1, (1 - wx) * wy)
    acc(x1, y1, wx * wy)
    if (a > 0) {
      out[di] = r / a
      out[di + 1] = g / a
      out[di + 2] = b / a
      // `a` is Σ(srcAlpha · spatialWeight); spatial weights sum to ≤1, so it's
      // already the interpolated alpha (fading at the bitmap border).
      out[di + 3] = a
    }
  }

  for (let oy = 0; oy < H; oy++) {
    for (let ox = 0; ox < W; ox++) {
      const u = (ox - padX) / textW
      const { top, bot } = warpEdges(
        warp.style,
        u,
        warp.bend,
        warp.horizontal,
        warp.vertical,
      )
      const bandTop = padY + textH * top
      const bandBot = padY + textH * bot
      const denom = bandBot - bandTop
      if (denom <= 0) continue
      const v = (oy - bandTop) / denom
      if (v < 0 || v > 1) continue
      const sy = padY + v * textH
      sample(ox, sy, (oy * W + ox) * 4)
    }
  }
  return out
}
