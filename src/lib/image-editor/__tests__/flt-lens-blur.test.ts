import { describe, it, expect } from 'vitest'
import { applyLensBlur, DEFAULT_LENS_BLUR } from '../flt-lens-blur'

/**
 * Node-only tests (no canvas). Lens Blur's defining behaviours: radius 0 is an
 * exact identity; a flat field stays flat (a disc average of a constant is the
 * same constant); alpha is preserved; and — the bokeh signature — a single
 * bright highlight on a dark field BLOOMS outward, lifting dark neighbours
 * inside the aperture disc above 0. We hand-build tiny RGBA buffers.
 */

/** Solid w×h field of one opaque colour. */
function solid(w: number, h: number, r: number, g: number, b: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = r
    d[i * 4 + 1] = g
    d[i * 4 + 2] = b
    d[i * 4 + 3] = 255
  }
  return d
}

function px(d: Uint8ClampedArray, w: number, x: number, y: number): number {
  return d[(y * w + x) * 4]
}

describe('applyLensBlur', () => {
  it('ships the documented defaults', () => {
    expect(DEFAULT_LENS_BLUR).toEqual({
      kind: 'lensBlur',
      radius: 12,
      bloom: 40,
      threshold: 200,
    })
  })

  it('radius 0 is an exact identity', () => {
    const W = 6
    const H = 5
    const d = new Uint8ClampedArray(W * H * 4)
    for (let i = 0; i < d.length; i += 4) {
      d[i] = (i * 7) % 256
      d[i + 1] = (i * 13) % 256
      d[i + 2] = (i * 29) % 256
      d[i + 3] = 255
    }
    const before = Array.from(d)
    applyLensBlur(d, W, H, { kind: 'lensBlur', radius: 0, bloom: 40, threshold: 200 })
    expect(Array.from(d)).toEqual(before)
  })

  it('leaves a uniform field exactly unchanged', () => {
    // A below-threshold constant: every disc sample weighs exactly 1, so the
    // weighted mean is bit-exact V even on edge pixels with fewer in-bounds
    // samples. (threshold 200 ⇒ luma 100 is well below it.)
    const W = 16
    const H = 16
    const before = solid(W, H, 100, 100, 100)
    const after = solid(W, H, 100, 100, 100)
    applyLensBlur(after, W, H, { kind: 'lensBlur', radius: 5, bloom: 40, threshold: 200 })
    expect(Array.from(after)).toEqual(Array.from(before))
  })

  it('leaves alpha untouched', () => {
    const W = 10
    const H = 10
    const d = solid(W, H, 120, 120, 120)
    for (let i = 3; i < d.length; i += 4) d[i] = 180 // distinctive alpha
    applyLensBlur(d, W, H, { ...DEFAULT_LENS_BLUR })
    for (let i = 3; i < d.length; i += 4) expect(d[i]).toBe(180)
  })

  it('width/height 0 returns without throwing', () => {
    const empty = new Uint8ClampedArray(0)
    expect(() => applyLensBlur(empty, 0, 0, { ...DEFAULT_LENS_BLUR })).not.toThrow()
    expect(() => applyLensBlur(empty, 0, 5, { ...DEFAULT_LENS_BLUR })).not.toThrow()
    expect(() => applyLensBlur(empty, 5, 0, { ...DEFAULT_LENS_BLUR })).not.toThrow()
    expect(empty.length).toBe(0)
  })

  it('blooms a single bright highlight outward over the aperture disc', () => {
    // All-black field with one pure-white pixel at the centre. With a modest
    // radius the disc around the highlight picks it up, so dark NEIGHBOURS
    // inside the disc brighten above their original 0. (The highlight's OWN
    // pixel necessarily DROPS — its energy is spread across the whole disc —
    // so we assert on a neighbour, not on the centre staying bright.)
    const W = 9
    const H = 9
    const cx = 4
    const cy = 4
    const d = solid(W, H, 0, 0, 0)
    const ci = (cy * W + cx) * 4
    d[ci] = 255
    d[ci + 1] = 255
    d[ci + 2] = 255

    applyLensBlur(d, W, H, { kind: 'lensBlur', radius: 3, bloom: 40, threshold: 200 })

    // A pixel one step from the highlight (well inside the r=3 disc) must have
    // brightened from pure black.
    expect(px(d, W, cx, cy + 1)).toBeGreaterThan(0)
    expect(px(d, W, cx + 1, cy)).toBeGreaterThan(0)

    // A corner pixel outside the highlight's disc (distance > 3) stays black —
    // the bloom is bounded by the aperture radius, not global.
    expect(px(d, W, 0, 0)).toBe(0)
    expect(px(d, W, W - 1, H - 1)).toBe(0)
  })
})
