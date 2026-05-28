import { describe, it, expect } from 'vitest'
import { applyVignette, DEFAULT_VIGNETTE } from '../flt-vignette'

/**
 * Node-only sanity tests (no canvas / ImageData). We build a flat grey buffer
 * by hand and assert the geometric guarantees of a vignette: the centre is
 * (very nearly) untouched while the corners are pushed toward black when
 * `amount` is negative.
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

describe('applyVignette', () => {
  const W = 21
  const H = 21
  const FILL = 200

  it('leaves the centre pixel ~unchanged with default (darkening) params', () => {
    const data = flat(W, H, FILL)
    applyVignette(data, W, H, { ...DEFAULT_VIGNETTE })
    const c = (((H - 1) / 2) * W + (W - 1) / 2) * 4
    // Centre sits inside the midpoint plateau, so it should barely move.
    expect(Math.abs(data[c] - FILL)).toBeLessThanOrEqual(2)
    expect(data[c + 3]).toBe(255) // alpha untouched
  })

  it('darkens a corner pixel when amount < 0', () => {
    const data = flat(W, H, FILL)
    applyVignette(data, W, H, { ...DEFAULT_VIGNETTE })
    const corner = 0 // top-left
    expect(data[corner]).toBeLessThan(FILL)
    expect(data[corner + 3]).toBe(255)
  })

  it('amount = 0 is an exact identity', () => {
    const data = flat(W, H, FILL)
    const before = Array.from(data)
    applyVignette(data, W, H, { ...DEFAULT_VIGNETTE, amount: 0 })
    expect(Array.from(data)).toEqual(before)
  })

  it('positive amount lightens the corner (screen toward white)', () => {
    const data = flat(W, H, FILL)
    applyVignette(data, W, H, { ...DEFAULT_VIGNETTE, amount: 80 })
    const corner = 0
    expect(data[corner]).toBeGreaterThan(FILL)
  })

  it('feather = 0 does not blow up (no NaN)', () => {
    const data = flat(W, H, FILL)
    applyVignette(data, W, H, { ...DEFAULT_VIGNETTE, feather: 0, amount: -100 })
    for (let i = 0; i < data.length; i++) expect(Number.isFinite(data[i])).toBe(true)
    // Corner should be fully darkened at amount -100.
    expect(data[0]).toBe(0)
  })
})
