import { describe, it, expect } from 'vitest'
import { extractMaskContour } from '../mask-contour'

/**
 * Tests for the Moore boundary tracer. The algorithm is sensitive to the
 * starting pixel + direction-wrap logic, so we lean on tiny hand-built
 * masks where we can predict the contour exactly.
 */
function makeMask(w: number, h: number, isSet: (x: number, y: number) => boolean): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const set = isSet(x, y)
      const v = set ? 255 : 0
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return data
}

describe('extractMaskContour', () => {
  it('returns empty path on empty mask', () => {
    const data = makeMask(16, 16, () => false)
    expect(extractMaskContour(data, 16, 16)).toEqual([])
  })

  it('traces a single pixel', () => {
    const data = makeMask(16, 16, (x, y) => x === 8 && y === 8)
    const path = extractMaskContour(data, 16, 16)
    expect(path.length).toBeGreaterThan(0)
    expect(path[0]).toEqual({ x: 8, y: 8 })
  })

  it('traces a filled square', () => {
    // 4×4 square at (4..7, 4..7) — 16 perimeter pixels.
    const data = makeMask(16, 16, (x, y) => x >= 4 && x <= 7 && y >= 4 && y <= 7)
    const path = extractMaskContour(data, 16, 16)
    expect(path.length).toBeGreaterThanOrEqual(4)
    // All path points must be on the perimeter (4 ≤ x ≤ 7, 4 ≤ y ≤ 7).
    for (const p of path) {
      expect(p.x).toBeGreaterThanOrEqual(4)
      expect(p.x).toBeLessThanOrEqual(7)
      expect(p.y).toBeGreaterThanOrEqual(4)
      expect(p.y).toBeLessThanOrEqual(7)
    }
    // Starts at the topmost-leftmost foreground pixel.
    expect(path[0]).toEqual({ x: 4, y: 4 })
  })

  it('honours custom threshold', () => {
    // Pixel luminance 100 — below default 127, above threshold=50.
    const data = makeMask(8, 8, (x, y) => x === 4 && y === 4)
    // Reduce one pixel's luminance to 100.
    const i = (4 * 8 + 4) * 4
    data[i] = 100
    data[i + 1] = 100
    data[i + 2] = 100
    expect(extractMaskContour(data, 8, 8, { threshold: 127 })).toEqual([])
    expect(extractMaskContour(data, 8, 8, { threshold: 50 })).toHaveLength(1)
  })

  it('caps point count via maxPoints', () => {
    // Big disc: every pixel inside a circle of radius 30 in a 64×64 buffer.
    const cx = 32, cy = 32, r = 30
    const data = makeMask(64, 64, (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r)
    const path = extractMaskContour(data, 64, 64, { maxPoints: 20 })
    expect(path.length).toBeLessThanOrEqual(20)
  })
})
