import { describe, it, expect } from 'vitest'
import { applyClouds, DEFAULT_CLOUDS } from '../flt-clouds'

/**
 * Node-only tests (no canvas). The key contract is determinism: identical
 * seeds must yield byte-identical buffers (preview == export), different seeds
 * must differ, and the output is fully opaque since Clouds replaces content.
 */
function blank(w: number, h: number): Uint8ClampedArray {
  return new Uint8ClampedArray(w * h * 4)
}

describe('applyClouds', () => {
  const W = 32
  const H = 24

  it('is deterministic: same seed → identical output', () => {
    const a = blank(W, H)
    const b = blank(W, H)
    applyClouds(a, W, H, { ...DEFAULT_CLOUDS, seed: 7 })
    applyClouds(b, W, H, { ...DEFAULT_CLOUDS, seed: 7 })
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('different seeds produce different output', () => {
    const a = blank(W, H)
    const b = blank(W, H)
    applyClouds(a, W, H, { ...DEFAULT_CLOUDS, seed: 1 })
    applyClouds(b, W, H, { ...DEFAULT_CLOUDS, seed: 2 })
    expect(Array.from(a)).not.toEqual(Array.from(b))
  })

  it('writes fully opaque pixels over the whole buffer', () => {
    const d = blank(W, H)
    applyClouds(d, W, H, { ...DEFAULT_CLOUDS })
    for (let i = 3; i < d.length; i += 4) expect(d[i]).toBe(255)
  })

  it('blends between bg and fg (values land within the color range)', () => {
    const d = blank(W, H)
    // bg = black, fg = white → every channel must be in [0, 255] and the field
    // must show variation (not a constant).
    applyClouds(d, W, H, { ...DEFAULT_CLOUDS, bg: '#000000', fg: '#ffffff' })
    let min = 255
    let max = 0
    for (let i = 0; i < d.length; i += 4) {
      min = Math.min(min, d[i])
      max = Math.max(max, d[i])
    }
    expect(min).toBeGreaterThanOrEqual(0)
    expect(max).toBeLessThanOrEqual(255)
    expect(max - min).toBeGreaterThan(0) // real variation, not flat
  })
})
