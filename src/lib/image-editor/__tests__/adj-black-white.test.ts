import { describe, it, expect } from 'vitest'
import { applyBlackWhite, DEFAULT_BLACK_WHITE } from '../adj-black-white'
import type { BlackWhiteParams } from '../types'

/**
 * Black & White converts color to gray with per-hue-family lightness control.
 * We assert the spec's guarantees on hand-built RGBA buffers (no canvas):
 *   - a red pixel reads brighter when its family slider is high vs. low;
 *   - already-gray pixels stay gray (and become tinted, not gray, with tint on);
 *   - the result is achromatic (R=G=B) when tint is off.
 */
function px(...rgba: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(rgba)
}

function withReds(reds: number): BlackWhiteParams {
  return { ...DEFAULT_BLACK_WHITE, reds }
}

describe('applyBlackWhite', () => {
  it('red pixel is brighter with high reds slider than with low', () => {
    const high = px(255, 0, 0, 255)
    const low = px(255, 0, 0, 255)
    applyBlackWhite(high, withReds(300))
    applyBlackWhite(low, withReds(-200))
    // high reds lifts a pure red toward white; low pushes it toward black.
    expect(high[0]).toBeGreaterThan(low[0])
    expect(high[0]).toBeGreaterThan(200) // near white
    expect(low[0]).toBeLessThan(20) // near black
  })

  it('output is neutral gray (R=G=B) when tint is off', () => {
    const data = px(200, 50, 30, 255)
    applyBlackWhite(data, DEFAULT_BLACK_WHITE)
    expect(data[0]).toBe(data[1])
    expect(data[1]).toBe(data[2])
  })

  it('a gray pixel stays the same gray (any sliders, tint off)', () => {
    const data = px(120, 120, 120, 255)
    applyBlackWhite(data, withReds(300))
    // Achromatic input has no chroma to scale, so its lightness is preserved.
    expect(data[0]).toBe(120)
    expect(data[1]).toBe(120)
    expect(data[2]).toBe(120)
  })

  it('tints a gray pixel toward the tint hue (sepia warms it)', () => {
    const data = px(120, 120, 120, 255)
    applyBlackWhite(data, {
      ...DEFAULT_BLACK_WHITE,
      tint: true,
      tintHue: 42, // warm / sepia
      tintSat: 25,
    })
    // No longer neutral: a warm sepia has R > G > B.
    expect(data[0]).toBeGreaterThan(data[2])
    expect(data[0]).not.toBe(data[2])
  })

  it('leaves alpha untouched', () => {
    const data = px(10, 200, 60, 137)
    applyBlackWhite(data, DEFAULT_BLACK_WHITE)
    expect(data[3]).toBe(137)
  })

  it('clamps out-of-range chroma cleanly (no NaN / overflow)', () => {
    const data = px(255, 0, 0, 255)
    applyBlackWhite(data, withReds(1000))
    expect(data[0]).toBe(255)
    expect(Number.isNaN(data[0])).toBe(false)
  })
})
