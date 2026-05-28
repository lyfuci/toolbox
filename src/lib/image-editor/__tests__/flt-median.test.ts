import { describe, it, expect } from 'vitest'
import { applyMedian, DEFAULT_MEDIAN } from '../flt-median'

/**
 * Node-only tests (no canvas). Median's two defining behaviours: it removes an
 * isolated impulse (speckle) on a flat field, and it preserves a clean step
 * edge. We hand-build tiny grey buffers and check both.
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
function setPx(d: Uint8ClampedArray, w: number, x: number, y: number, v: number): void {
  const i = (y * w + x) * 4
  d[i] = v
  d[i + 1] = v
  d[i + 2] = v
}
function getPx(d: Uint8ClampedArray, w: number, x: number, y: number): number {
  return d[(y * w + x) * 4]
}

describe('applyMedian', () => {
  it('removes a single bright speckle on a flat field', () => {
    const W = 7
    const H = 7
    const FIELD = 50
    const d = flat(W, H, FIELD)
    setPx(d, W, 3, 3, 255) // lone hot pixel in the centre
    applyMedian(d, W, H, { ...DEFAULT_MEDIAN }) // radius 2 → 5×5 window
    // The speckle is a tiny minority in a 25-sample window → median = field.
    expect(getPx(d, W, 3, 3)).toBe(FIELD)
    expect(d[(3 * W + 3) * 4 + 3]).toBe(255) // alpha preserved
  })

  it('preserves a clean vertical step edge', () => {
    const W = 8
    const H = 8
    const LO = 30
    const HI = 220
    const d = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = x < W / 2 ? LO : HI
        const i = (y * W + x) * 4
        d[i] = v
        d[i + 1] = v
        d[i + 2] = v
        d[i + 3] = 255
      }
    }
    const before = Array.from(d)
    applyMedian(d, W, H, { kind: 'median', radius: 1 })
    // Pixels well away from the boundary keep their side's value exactly; the
    // edge itself stays a hard LO/HI split (no intermediate grey introduced).
    for (let y = 0; y < H; y++) {
      expect(getPx(d, W, 0, y)).toBe(LO)
      expect(getPx(d, W, 1, y)).toBe(LO)
      expect(getPx(d, W, W - 1, y)).toBe(HI)
      expect(getPx(d, W, W - 2, y)).toBe(HI)
      // Boundary columns must still be exactly LO or HI, never a blurred mix.
      expect([LO, HI]).toContain(getPx(d, W, 3, y))
      expect([LO, HI]).toContain(getPx(d, W, 4, y))
    }
    // And the buffer actually changed nowhere on a perfect edge → identity here.
    expect(Array.from(d)).toEqual(before)
  })
})
