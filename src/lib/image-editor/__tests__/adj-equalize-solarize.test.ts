import { describe, it, expect } from 'vitest'
import { applyEqualize } from '../adj-equalize'
import { applySolarize } from '../adj-solarize'

/** Build an RGBA buffer from a per-pixel callback returning [r,g,b,a]. */
function buf(n: number, fn: (i: number) => [number, number, number, number]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i++) {
    const [r, g, b, a] = fn(i)
    d[i * 4] = r
    d[i * 4 + 1] = g
    d[i * 4 + 2] = b
    d[i * 4 + 3] = a
  }
  return d
}

describe('applyEqualize', () => {
  it('stretches a low-contrast image toward the full range', () => {
    // 256 px all clustered in [100,140] → after equalize the spread widens.
    const d = buf(256, (i) => {
      const v = 100 + (i % 41)
      return [v, v, v, 255]
    })
    applyEqualize(d, { kind: 'equalize' })
    let min = 255
    let max = 0
    for (let i = 0; i < 256; i++) {
      const v = d[i * 4]
      if (v < min) min = v
      if (v > max) max = v
    }
    // Range should be much wider than the original 40.
    expect(max - min).toBeGreaterThan(150)
  })

  it('leaves a uniform image essentially unchanged and skips transparent pixels', () => {
    const d = buf(16, () => [128, 128, 128, 255])
    applyEqualize(d, { kind: 'equalize' })
    for (let i = 0; i < 16; i++) expect(d[i * 4]).toBeGreaterThanOrEqual(0)
    const t = buf(4, () => [200, 50, 50, 0])
    const before = t.slice()
    applyEqualize(t, { kind: 'equalize' })
    expect(Array.from(t)).toEqual(Array.from(before))
  })
})

describe('applySolarize', () => {
  it('inverts channels above the threshold, leaves the rest', () => {
    const d = buf(2, (i) => (i === 0 ? [200, 100, 50, 255] : [10, 130, 250, 255]))
    applySolarize(d, { kind: 'solarize', threshold: 128 })
    // px0: 200>128 → 55; 100,50 unchanged
    expect([d[0], d[1], d[2]]).toEqual([55, 100, 50])
    // px1: 130>128 → 125; 250>128 → 5; 10 unchanged
    expect([d[4], d[5], d[6]]).toEqual([10, 125, 5])
  })
})
