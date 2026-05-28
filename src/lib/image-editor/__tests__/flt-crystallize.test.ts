import { describe, it, expect } from 'vitest'
import { applyCrystallize, DEFAULT_CRYSTALLIZE } from '../flt-crystallize'

/**
 * Node-only tests (no canvas). Crystallize's contract: flat input is
 * preserved, a multi-region image collapses to a small set of cell-average
 * colors, output is deterministic (preview == export), and a cell larger than
 * the image yields essentially one color.
 */

function fill(w: number, h: number, rgba: [number, number, number, number]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < d.length; i += 4) {
    d[i] = rgba[0]
    d[i + 1] = rgba[1]
    d[i + 2] = rgba[2]
    d[i + 3] = rgba[3]
  }
  return d
}

/** Count distinct RGBA colors in a buffer (as packed strings). */
function distinctColors(d: Uint8ClampedArray): number {
  const set = new Set<string>()
  for (let i = 0; i < d.length; i += 4) {
    set.add(`${d[i]},${d[i + 1]},${d[i + 2]},${d[i + 3]}`)
  }
  return set.size
}

describe('applyCrystallize', () => {
  const W = 64
  const H = 48

  it('leaves a flat color unchanged (average of one color is that color)', () => {
    const d = fill(W, H, [120, 60, 200, 255])
    applyCrystallize(d, W, H, { ...DEFAULT_CRYSTALLIZE, cellSize: 12 })
    for (let i = 0; i < d.length; i += 4) {
      expect(d[i]).toBe(120)
      expect(d[i + 1]).toBe(60)
      expect(d[i + 2]).toBe(200)
      expect(d[i + 3]).toBe(255)
    }
  })

  it('reduces a two-region image to a small number of cell colors', () => {
    // Left half red, right half blue.
    const d = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        const left = x < W / 2
        d[i] = left ? 255 : 0
        d[i + 1] = 0
        d[i + 2] = left ? 0 : 255
        d[i + 3] = 255
      }
    }
    applyCrystallize(d, W, H, { ...DEFAULT_CRYSTALLIZE, cellSize: 16 })
    const colors = distinctColors(d)
    // Far fewer colors than pixels: one (or a couple blended) average per cell.
    // Grid is ~4x3 cells, so a couple dozen at most — assert well below pixels.
    expect(colors).toBeGreaterThanOrEqual(2)
    expect(colors).toBeLessThan(W * H)
    expect(colors).toBeLessThanOrEqual(64)
  })

  it('is deterministic: same params → byte-identical output', () => {
    const a = new Uint8ClampedArray(W * H * 4)
    const b = new Uint8ClampedArray(W * H * 4)
    // Seed both with a gradient so cells have nontrivial averages.
    for (let p = 0; p < W * H; p++) {
      const v = (p * 37) % 256
      const di = p * 4
      a[di] = b[di] = v
      a[di + 1] = b[di + 1] = (v * 3) % 256
      a[di + 2] = b[di + 2] = (v * 7) % 256
      a[di + 3] = b[di + 3] = 255
    }
    applyCrystallize(a, W, H, { ...DEFAULT_CRYSTALLIZE, cellSize: 10 })
    applyCrystallize(b, W, H, { ...DEFAULT_CRYSTALLIZE, cellSize: 10 })
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('cellSize covering the whole image collapses to ~one color', () => {
    // Checkerboard-ish input so the source has many colors.
    const d = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        const on = (x + y) % 2 === 0
        d[i] = on ? 200 : 40
        d[i + 1] = on ? 40 : 200
        d[i + 2] = 100
        d[i + 3] = 255
      }
    }
    applyCrystallize(d, W, H, { ...DEFAULT_CRYSTALLIZE, cellSize: 1000 })
    // One grid cell → one Voronoi region → one averaged color everywhere.
    expect(distinctColors(d)).toBe(1)
  })
})
