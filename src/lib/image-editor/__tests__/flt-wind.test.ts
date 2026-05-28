import { describe, it, expect } from 'vitest'
import { applyWind, DEFAULT_WIND } from '../flt-wind'

/**
 * Node-only tests (no canvas). Wind's defining behaviour: a strong vertical
 * edge throws HORIZONTAL streaks in the wind direction; flat fields and
 * strength 0 are ~identity; output is fully deterministic across runs.
 * We hand-build tiny RGBA buffers.
 */

/** White field with a black vertical strip occupying columns [x0, x1]. */
function whiteWithBlackStrip(W: number, H: number, x0: number, x1: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inStrip = x >= x0 && x <= x1
      const v = inStrip ? 0 : 255
      const i = (y * W + x) * 4
      d[i] = v
      d[i + 1] = v
      d[i + 2] = v
      d[i + 3] = 255
    }
  }
  return d
}

function px(d: Uint8ClampedArray, W: number, x: number, y: number): number {
  return d[(y * W + x) * 4]
}

describe('applyWind', () => {
  it('streaks horizontally from a vertical edge in the wind direction (right)', () => {
    const W = 24
    const H = 6
    // Black strip cols 10..13 on white. With wind 'right' the bright (white)
    // upwind pixel at the strip's LEFT edge bleeds rightward INTO the strip,
    // so dark pixels just inside the left edge brighten.
    const d = whiteWithBlackStrip(W, H, 10, 13)
    const before = Array.from(d)
    applyWind(d, W, H, { kind: 'wind', direction: 'right', strength: 60 })

    // Something must have changed (streaks were painted).
    expect(Array.from(d)).not.toEqual(before)

    // Inside the strip, columns to the RIGHT of its left edge (x=10) should be
    // brighter than the original pure black — white bled rightward into them.
    let brightenedInside = 0
    for (let y = 0; y < H; y++) {
      for (let x = 10; x <= 13; x++) {
        if (px(d, W, x, y) > 0) brightenedInside++
      }
    }
    expect(brightenedInside).toBeGreaterThan(0)

    // Streaking is purely horizontal: a column entirely in the flat white field
    // far from any edge (x=0) is untouched white on every row.
    for (let y = 0; y < H; y++) expect(px(d, W, 0, y)).toBe(255)
  })

  it('streaks the opposite way for direction left', () => {
    const W = 24
    const H = 6
    const d = whiteWithBlackStrip(W, H, 10, 13)
    applyWind(d, W, H, { kind: 'wind', direction: 'left', strength: 60 })

    // With wind 'left' the bright source is the white pixel at the strip's
    // RIGHT edge (x=14), bleeding leftward into the strip, so dark pixels near
    // the right edge of the strip brighten.
    let brightenedRightSide = 0
    for (let y = 0; y < H; y++) {
      for (let x = 11; x <= 13; x++) {
        if (px(d, W, x, y) > 0) brightenedRightSide++
      }
    }
    expect(brightenedRightSide).toBeGreaterThan(0)
  })

  it('strength 0 is ~identity', () => {
    const W = 20
    const H = 5
    const d = whiteWithBlackStrip(W, H, 8, 11)
    const before = Array.from(d)
    applyWind(d, W, H, { kind: 'wind', direction: 'right', strength: 0 })
    expect(Array.from(d)).toEqual(before)
  })

  it('a flat field with no edges is identity', () => {
    const W = 16
    const H = 4
    const d = new Uint8ClampedArray(W * H * 4)
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 130
      d[i + 1] = 130
      d[i + 2] = 130
      d[i + 3] = 255
    }
    const before = Array.from(d)
    applyWind(d, W, H, { ...DEFAULT_WIND })
    expect(Array.from(d)).toEqual(before)
  })

  it('is deterministic — two runs produce byte-identical output', () => {
    const W = 24
    const H = 6
    const a = whiteWithBlackStrip(W, H, 10, 13)
    const b = whiteWithBlackStrip(W, H, 10, 13)
    applyWind(a, W, H, { ...DEFAULT_WIND })
    applyWind(b, W, H, { ...DEFAULT_WIND })
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('leaves alpha untouched', () => {
    const W = 20
    const H = 4
    const d = whiteWithBlackStrip(W, H, 8, 11)
    for (let i = 3; i < d.length; i += 4) d[i] = 180
    applyWind(d, W, H, { ...DEFAULT_WIND })
    for (let i = 3; i < d.length; i += 4) expect(d[i]).toBe(180)
  })
})
