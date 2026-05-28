import { describe, it, expect } from 'vitest'
import { applyOilPaint, DEFAULT_OIL_PAINT } from '../flt-oil-paint'

/**
 * Node-only tests (no canvas). Oil Paint's defining behaviour is the
 * most-populous-intensity-bin step: a flat region collapses to one brush
 * colour, and across a two-region split each interior pixel snaps to its OWN
 * region's colour (the dominant bin is that region) rather than blending the
 * two sides into a box-blur grey. Plus radius 0 → identity, alpha untouched,
 * and zero-size returns cleanly. We hand-build tiny RGBA buffers.
 */
function flat(w: number, h: number, v: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < d.length; i += 4) {
    d[i] = v
    d[i + 1] = v
    d[i + 2] = v
    d[i + 3] = 255
  }
  return d
}
function getPx(d: Uint8ClampedArray, w: number, x: number, y: number): number {
  return d[(y * w + x) * 4]
}

describe('applyOilPaint', () => {
  it('radius 0 is the identity', () => {
    const W = 5
    const H = 5
    const d = new Uint8ClampedArray(W * H * 4)
    for (let i = 0; i < d.length; i += 4) {
      d[i] = (i * 7) % 256
      d[i + 1] = (i * 13) % 256
      d[i + 2] = (i * 29) % 256
      d[i + 3] = 255
    }
    const before = Array.from(d)
    applyOilPaint(d, W, H, { kind: 'oilPaint', radius: 0, levels: 20 })
    expect(Array.from(d)).toEqual(before)
  })

  it('leaves a uniform field unchanged', () => {
    const W = 9
    const H = 9
    const FIELD = 137
    const d = flat(W, H, FIELD)
    const before = Array.from(d)
    applyOilPaint(d, W, H, { ...DEFAULT_OIL_PAINT })
    // Every neighbour shares one bin whose mean is exactly the field value, so
    // a uniform input is a fixed point — the buffer is untouched.
    expect(Array.from(d)).toEqual(before)
  })

  it('leaves alpha untouched', () => {
    const W = 8
    const H = 8
    const d = new Uint8ClampedArray(W * H * 4)
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 100
      d[i + 1] = 150
      d[i + 2] = 200
      d[i + 3] = 200 // distinctive alpha
    }
    applyOilPaint(d, W, H, { ...DEFAULT_OIL_PAINT })
    for (let i = 3; i < d.length; i += 4) expect(d[i]).toBe(200)
  })

  it('returns without throwing on zero width/height', () => {
    expect(() => applyOilPaint(new Uint8ClampedArray(0), 0, 5, { ...DEFAULT_OIL_PAINT })).not.toThrow()
    expect(() => applyOilPaint(new Uint8ClampedArray(0), 5, 0, { ...DEFAULT_OIL_PAINT })).not.toThrow()
    expect(() => applyOilPaint(new Uint8ClampedArray(0), 0, 0, { ...DEFAULT_OIL_PAINT })).not.toThrow()
  })

  it('does not bleed colours across a two-region split (dominant bin is own region)', () => {
    // Left half = grey 60, right half = grey 200. With levels 20 those luma
    // values quantise to DIFFERENT bins (round(60·19/255)=4, round(200·19/255)
    // =15), so the two regions never share a bin. The window (radius 4 → 9px
    // wide) of an interior pixel sits entirely inside one half, so the only
    // populated bin is that region's → the output is exactly its own colour,
    // never a 60/200 blend the way a box blur would produce (~130).
    const W = 20
    const H = 10
    const LEFT = 60
    const RIGHT = 200
    const d = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = x < W / 2 ? LEFT : RIGHT
        const i = (y * W + x) * 4
        d[i] = v
        d[i + 1] = v
        d[i + 2] = v
        d[i + 3] = 255
      }
    }
    applyOilPaint(d, W, H, { ...DEFAULT_OIL_PAINT }) // radius 4, levels 20
    for (let y = 0; y < H; y++) {
      // x=4: window columns [0,8] ⊂ left half → exactly LEFT.
      expect(getPx(d, W, 4, y)).toBe(LEFT)
      // x=15: window columns [11,19] ⊂ right half → exactly RIGHT.
      expect(getPx(d, W, 15, y)).toBe(RIGHT)
    }
  })
})
