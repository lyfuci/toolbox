import { describe, it, expect } from 'vitest'
import {
  applyShadowsHighlights,
  DEFAULT_SHADOWS_HIGHLIGHTS,
  type ShadowsHighlightsParams,
} from '../flt-shadows-highlights'

/**
 * Node-only (no DOM): we hand-build a horizontal greyscale gradient buffer
 * (dark on the left → light on the right) and assert the regional tone moves
 * the right direction. We avoid asserting exact arithmetic — the smoothstep
 * masks and box blur make exact values brittle — and instead test the public
 * guarantees: shadows lift darks, highlights pull brights, hue is preserved,
 * alpha is untouched, and radius=0 doesn't throw.
 */

const W = 64
const H = 2

/** Build a dark→light horizontal grey gradient as RGBA, opaque. */
function gradient(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = Math.round((x / (W - 1)) * 255)
      const i = (y * W + x) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return data
}

/** Read the R channel at column x (row 0). Gradient is grey so R == G == B. */
function valAt(data: Uint8ClampedArray, x: number): number {
  return data[x * 4]
}

describe('applyShadowsHighlights', () => {
  it('lifts originally-dark pixels while barely touching bright ones (shadows)', () => {
    const before = gradient()
    const after = gradient()
    const params: ShadowsHighlightsParams = {
      kind: 'shadowsHighlights',
      shadowsAmount: 60,
      highlightsAmount: 0,
      radius: 8,
    }
    applyShadowsHighlights(after, W, H, params)

    // A dark pixel (left end) must get meaningfully brighter.
    const darkX = 4
    expect(valAt(after, darkX)).toBeGreaterThan(valAt(before, darkX) + 5)

    // A bright pixel (right end) should be essentially unchanged — the shadows
    // mask is ~0 there. Allow a tiny tolerance for smoothstep boundary spill.
    const brightX = W - 3
    expect(
      Math.abs(valAt(after, brightX) - valAt(before, brightX)),
    ).toBeLessThanOrEqual(3)
  })

  it('darkens bright pixels while barely touching dark ones (highlights)', () => {
    const before = gradient()
    const after = gradient()
    const params: ShadowsHighlightsParams = {
      kind: 'shadowsHighlights',
      shadowsAmount: 0,
      highlightsAmount: 60,
      radius: 8,
    }
    applyShadowsHighlights(after, W, H, params)

    // A bright pixel must get meaningfully darker.
    const brightX = W - 5
    expect(valAt(after, brightX)).toBeLessThan(valAt(before, brightX) - 5)

    // A dark pixel should be essentially unchanged — highlights mask ~0 there.
    const darkX = 3
    expect(
      Math.abs(valAt(after, darkX) - valAt(before, darkX)),
    ).toBeLessThanOrEqual(3)
  })

  it('preserves hue (equal channel deltas on grey) and leaves alpha alone', () => {
    const data = gradient()
    applyShadowsHighlights(data, W, H, {
      kind: 'shadowsHighlights',
      shadowsAmount: 50,
      highlightsAmount: 0,
      radius: 6,
    })
    for (let x = 0; x < W; x++) {
      const i = x * 4
      // Grey in → grey out: R == G == B keeps hue neutral.
      expect(data[i]).toBe(data[i + 1])
      expect(data[i + 1]).toBe(data[i + 2])
      // Alpha untouched.
      expect(data[i + 3]).toBe(255)
    }
  })

  it('runs with radius=0 without throwing and still lifts shadows', () => {
    const before = gradient()
    const after = gradient()
    expect(() =>
      applyShadowsHighlights(after, W, H, {
        kind: 'shadowsHighlights',
        shadowsAmount: 50,
        highlightsAmount: 0,
        radius: 0,
      }),
    ).not.toThrow()
    const darkX = 4
    expect(valAt(after, darkX)).toBeGreaterThan(valAt(before, darkX))
  })

  it('is a no-op when both amounts are 0', () => {
    const before = gradient()
    const after = gradient()
    applyShadowsHighlights(after, W, H, {
      kind: 'shadowsHighlights',
      shadowsAmount: 0,
      highlightsAmount: 0,
      radius: 30,
    })
    for (let i = 0; i < before.length; i++) {
      expect(after[i]).toBe(before[i])
    }
  })

  it('ships sensible defaults', () => {
    expect(DEFAULT_SHADOWS_HIGHLIGHTS.kind).toBe('shadowsHighlights')
    expect(DEFAULT_SHADOWS_HIGHLIGHTS.shadowsAmount).toBe(35)
    expect(DEFAULT_SHADOWS_HIGHLIGHTS.highlightsAmount).toBe(0)
    expect(DEFAULT_SHADOWS_HIGHLIGHTS.radius).toBe(30)
  })
})
