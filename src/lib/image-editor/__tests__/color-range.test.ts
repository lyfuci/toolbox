import { describe, it, expect } from 'vitest'
import {
  colorRangeMask,
  largestComponentMask,
  colorRangeSelection,
} from '../color-range'

/**
 * Pure-function tests for Color Range — all on hand-built RGBA buffers, no
 * DOM / canvas. We use tiny images with a known red region on white so the
 * mask, connected-component reduction, and traced polygon are all predictable.
 */

type RGB = { r: number; g: number; b: number }

/**
 * Build a w×h RGBA buffer. `colorAt` returns the RGB for each pixel (alpha is
 * forced opaque unless `alphaAt` overrides it), letting tests paint shapes.
 */
function makeImage(
  w: number,
  h: number,
  colorAt: (x: number, y: number) => RGB,
  alphaAt?: (x: number, y: number) => number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const c = colorAt(x, y)
      data[i] = c.r
      data[i + 1] = c.g
      data[i + 2] = c.b
      data[i + 3] = alphaAt ? alphaAt(x, y) : 255
    }
  }
  return data
}

const WHITE: RGB = { r: 255, g: 255, b: 255 }
const RED: RGB = { r: 255, g: 0, b: 0 }

describe('colorRangeMask', () => {
  it('selects only pixels within range of the sample', () => {
    // 10×10 white with a 3×3 red square at (2..4, 2..4).
    const inRed = (x: number, y: number) => x >= 2 && x <= 4 && y >= 2 && y <= 4
    const data = makeImage(10, 10, (x, y) => (inRed(x, y) ? RED : WHITE))
    const mask = colorRangeMask(data, 10, 10, RED, 40)
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const p = y * 10 + x
        expect(mask[p]).toBe(inRed(x, y) ? 255 : 0)
      }
    }
  })

  it('grows the selection as fuzziness increases', () => {
    // White with one pure-red and one dark-red pixel.
    const data = makeImage(4, 4, (x, y) => {
      if (x === 0 && y === 0) return RED
      if (x === 1 && y === 0) return { r: 180, g: 0, b: 0 } // dist √(75²)=75 from red
      return WHITE
    })
    const tight = colorRangeMask(data, 4, 4, RED, 40)
    expect(tight[0]).toBe(255)
    expect(tight[1]).toBe(0) // 75 > 40 → excluded
    const loose = colorRangeMask(data, 4, 4, RED, 100)
    expect(loose[0]).toBe(255)
    expect(loose[1]).toBe(255) // 75 <= 100 → included
  })

  it('never selects fully-transparent pixels even if colour matches', () => {
    const data = makeImage(
      2,
      2,
      () => RED,
      (x) => (x === 0 ? 0 : 255), // left column transparent
    )
    const mask = colorRangeMask(data, 2, 2, RED, 40)
    expect(mask[0]).toBe(0) // (0,0) transparent
    expect(mask[1]).toBe(255) // (1,0) opaque red
  })
})

describe('largestComponentMask', () => {
  it('keeps only the largest of two disjoint blobs and reports the count', () => {
    // 10×10 white. Big blob: 3×3 at (1..3,1..3) = 9 px. Small blob: 2×2 at
    // (7..8,7..8) = 4 px. They share no edge → two components.
    const big = (x: number, y: number) => x >= 1 && x <= 3 && y >= 1 && y <= 3
    const small = (x: number, y: number) => x >= 7 && x <= 8 && y >= 7 && y <= 8
    const data = makeImage(10, 10, (x, y) => (big(x, y) || small(x, y) ? RED : WHITE))
    const raw = colorRangeMask(data, 10, 10, RED, 40)
    const { mask, regionCount } = largestComponentMask(raw, 10, 10)
    expect(regionCount).toBe(2)
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const p = y * 10 + x
        // Only the big blob survives.
        expect(mask[p]).toBe(big(x, y) ? 255 : 0)
      }
    }
  })

  it('reports zero regions on an empty mask', () => {
    const empty = new Uint8Array(16)
    const { mask, regionCount } = largestComponentMask(empty, 4, 4)
    expect(regionCount).toBe(0)
    expect(Array.from(mask).every((v) => v === 0)).toBe(true)
  })
})

describe('colorRangeSelection', () => {
  it('returns a polygon whose bbox matches the sampled square', () => {
    // 12×12 white with a 5×5 red square at (3..7, 3..7).
    const inRed = (x: number, y: number) => x >= 3 && x <= 7 && y >= 3 && y <= 7
    const data = makeImage(12, 12, (x, y) => (inRed(x, y) ? RED : WHITE))
    const sel = colorRangeSelection(data, 12, 12, RED, 40)
    expect(sel).not.toBeNull()
    if (!sel) return
    expect(sel.regionCount).toBe(1)
    expect(sel.bbox).toEqual({ x: 3, y: 3, w: 5, h: 5 })
    expect(sel.path.length).toBeGreaterThanOrEqual(3)
    // Every contour vertex sits on the red square's perimeter span.
    for (const pt of sel.path) {
      expect(pt.x).toBeGreaterThanOrEqual(3)
      expect(pt.x).toBeLessThanOrEqual(7)
      expect(pt.y).toBeGreaterThanOrEqual(3)
      expect(pt.y).toBeLessThanOrEqual(7)
    }
  })

  it('reports regionCount from the full mask but keeps one blob', () => {
    // Two separated 4×4 red squares → count 2, bbox covers only the first.
    const a = (x: number, y: number) => x >= 1 && x <= 4 && y >= 1 && y <= 4
    const b = (x: number, y: number) => x >= 9 && x <= 12 && y >= 9 && y <= 12
    const data = makeImage(16, 16, (x, y) => (a(x, y) || b(x, y) ? RED : WHITE))
    const sel = colorRangeSelection(data, 16, 16, RED, 40)
    expect(sel).not.toBeNull()
    if (!sel) return
    expect(sel.regionCount).toBe(2)
    // Both blobs are the same size; the first found (blob a) wins on the
    // strictly-greater tie-break, so bbox is the (1..4) square.
    expect(sel.bbox).toEqual({ x: 1, y: 1, w: 4, h: 4 })
  })

  it('returns null when nothing matches the sample', () => {
    const data = makeImage(8, 8, () => WHITE)
    expect(colorRangeSelection(data, 8, 8, RED, 40)).toBeNull()
  })
})
