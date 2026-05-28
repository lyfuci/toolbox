import { describe, it, expect } from 'vitest'
import { applyGlowingEdges, DEFAULT_GLOWING_EDGES } from '../flt-glowing-edges'

/**
 * Node-only tests (no canvas). Glowing Edges' defining behaviours: a UNIFORM
 * field has no gradient → pure black everywhere (frame included, thanks to
 * clamp-per-tap Sobel); a sharp black|white boundary lights up bright; alpha is
 * untouched; zero dimensions are a safe no-op. We hand-build tiny RGBA buffers.
 */

/** Solid grey field, distinctive alpha, used for the "no edges" case. */
function uniform(W: number, H: number, v: number, a = 255): Uint8ClampedArray {
  const d = new Uint8ClampedArray(W * H * 4)
  for (let i = 0; i < d.length; i += 4) {
    d[i] = v
    d[i + 1] = v
    d[i + 2] = v
    d[i + 3] = a
  }
  return d
}

function px(d: Uint8ClampedArray, W: number, x: number, y: number): number {
  return d[(y * W + x) * 4]
}

describe('applyGlowingEdges', () => {
  it('a uniform field has no edges → every pixel is pure black', () => {
    const W = 8
    const H = 8
    const d = uniform(W, H, 137)
    // smoothness 0 keeps it exact (no blur path); a flat field has zero
    // gradient at every tap, so the Sobel magnitude is 0 frame-to-centre.
    applyGlowingEdges(d, W, H, {
      kind: 'glowingEdges',
      edgeWidth: 2,
      brightness: 60,
      smoothness: 0,
    })
    for (let i = 0; i < d.length; i += 4) {
      expect(d[i]).toBe(0)
      expect(d[i + 1]).toBe(0)
      expect(d[i + 2]).toBe(0)
    }
  })

  it('a sharp vertical black|white boundary lights up bright near the edge', () => {
    const W = 16
    const H = 8
    const BOUNDARY = 8 // cols < 8 black, cols >= 8 white
    const d = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = x < BOUNDARY ? 0 : 255
        const i = (y * W + x) * 4
        d[i] = v
        d[i + 1] = v
        d[i + 2] = v
        d[i + 3] = 255
      }
    }
    const step = 2
    applyGlowingEdges(d, W, H, {
      kind: 'glowingEdges',
      edgeWidth: step,
      brightness: 60,
      smoothness: 0, // keep the bright band crisp + deterministic
    })

    // Within a ±step band around the boundary the Sobel response is strong, so
    // at least one pixel there must have lit up (non-zero, bright).
    let brightInBand = 0
    let maxInBand = 0
    for (let y = 0; y < H; y++) {
      for (let x = BOUNDARY - step; x <= BOUNDARY + step; x++) {
        const v = px(d, W, x, y)
        if (v > 0) brightInBand++
        if (v > maxInBand) maxInBand = v
      }
    }
    expect(brightInBand).toBeGreaterThan(0)
    expect(maxInBand).toBeGreaterThan(128) // it genuinely glows, not a faint trace

    // Far from the edge, the flat interior stays black (column 0 is all black).
    for (let y = 0; y < H; y++) expect(px(d, W, 0, y)).toBe(0)
  })

  it('leaves alpha untouched (and exercises the default blur path)', () => {
    const W = 12
    const H = 12
    // A non-uniform image so the blur path actually has edges to soften, run
    // with DEFAULT params (smoothness 6) to exercise the separable box blur.
    const d = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = x < W / 2 ? 30 : 220
        const i = (y * W + x) * 4
        d[i] = v
        d[i + 1] = v
        d[i + 2] = v
        d[i + 3] = 173 // distinctive alpha
      }
    }
    expect(() =>
      applyGlowingEdges(d, W, H, { ...DEFAULT_GLOWING_EDGES }),
    ).not.toThrow()
    for (let i = 3; i < d.length; i += 4) expect(d[i]).toBe(173)
  })

  it('width or height 0 returns without throwing', () => {
    expect(() =>
      applyGlowingEdges(new Uint8ClampedArray(0), 0, 0, {
        ...DEFAULT_GLOWING_EDGES,
      }),
    ).not.toThrow()
    expect(() =>
      applyGlowingEdges(new Uint8ClampedArray(0), 4, 0, {
        ...DEFAULT_GLOWING_EDGES,
      }),
    ).not.toThrow()
  })
})
