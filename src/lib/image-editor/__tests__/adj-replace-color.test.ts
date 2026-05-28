import { describe, it, expect } from 'vitest'
import {
  applyReplaceColor,
  DEFAULT_REPLACE_COLOR,
  type ReplaceColorParams,
} from '../adj-replace-color'

/**
 * Replace Color shifts matching pixels in HSL space; we assert the spec's
 * guarantees on hand-built RGBA buffers (no canvas):
 *   - a target-matching pixel honours hueShift (red + 120° → green);
 *   - a pixel far outside fuzziness is left exactly as-is (weight 0);
 *   - fuzziness 0 behaves as an exact-match cut (only pixels at distance 0
 *     are touched), confirming the special case in `matchWeight`;
 *   - alpha is never modified, and transparent pixels are skipped wholesale.
 */
function px(...rgba: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(rgba)
}

function withParams(overrides: Partial<ReplaceColorParams>): ReplaceColorParams {
  return { ...DEFAULT_REPLACE_COLOR, ...overrides }
}

describe('applyReplaceColor', () => {
  it('rotates a target-matching red pixel toward green at hueShift +120°', () => {
    const data = px(255, 0, 0, 255)
    applyReplaceColor(
      data,
      withParams({ target: { r: 255, g: 0, b: 0 }, fuzziness: 40, hueShift: 120 }),
    )
    // Exact target → weight 1 → pure hue-rotated colour. Red @ +120° = green.
    expect(data[1]).toBeGreaterThan(200)
    expect(data[0]).toBeLessThan(20)
    expect(data[2]).toBeLessThan(20)
  })

  it('leaves a far-from-target pixel untouched (weight 0)', () => {
    // Pure blue is ~360 RGB-distance from pure red — well beyond fuzziness 40.
    const data = px(0, 0, 255, 255)
    applyReplaceColor(
      data,
      withParams({ target: { r: 255, g: 0, b: 0 }, fuzziness: 40, hueShift: 180 }),
    )
    expect(data[0]).toBe(0)
    expect(data[1]).toBe(0)
    expect(data[2]).toBe(255)
  })

  it('fuzziness 0 acts as a hard exact-match (only exact-or-near pixels affected)', () => {
    // One pixel is exactly the target, the other is 1 step away in red.
    const exact = px(255, 0, 0, 255)
    const near = px(254, 0, 0, 255)
    const params = withParams({
      target: { r: 255, g: 0, b: 0 },
      fuzziness: 0,
      hueShift: 120,
    })
    applyReplaceColor(exact, params)
    applyReplaceColor(near, params)
    // Exact match must move toward green; non-exact must stay byte-identical.
    expect(exact[1]).toBeGreaterThan(200)
    expect(near[0]).toBe(254)
    expect(near[1]).toBe(0)
    expect(near[2]).toBe(0)
  })

  it('skips fully transparent pixels (RGB and alpha preserved)', () => {
    // RGB happens to equal the target; alpha 0 must veto any processing so
    // padding pixels don't leak colour into the result.
    const data = px(255, 0, 0, 0)
    applyReplaceColor(
      data,
      withParams({ target: { r: 255, g: 0, b: 0 }, fuzziness: 40, hueShift: 120 }),
    )
    expect(data[0]).toBe(255)
    expect(data[1]).toBe(0)
    expect(data[2]).toBe(0)
    expect(data[3]).toBe(0)
  })

  it('leaves alpha untouched on processed pixels', () => {
    const data = px(255, 0, 0, 137)
    applyReplaceColor(
      data,
      withParams({ target: { r: 255, g: 0, b: 0 }, fuzziness: 40, hueShift: 120 }),
    )
    expect(data[3]).toBe(137)
  })

  it('soft falloff: a pixel at half the fuzziness radius blends partially', () => {
    // Construct a pixel ~20 units from target (half of fuzziness=40). Linear
    // falloff → weight ≈ 0.5, so the output should land between the original
    // red and the fully-rotated green rather than at either extreme.
    const data = px(235, 0, 0, 255)
    applyReplaceColor(
      data,
      withParams({ target: { r: 255, g: 0, b: 0 }, fuzziness: 40, hueShift: 120 }),
    )
    // Red dropped (but not to zero), green lifted (but not to max): partial blend.
    expect(data[0]).toBeLessThan(235)
    expect(data[0]).toBeGreaterThan(20)
    expect(data[1]).toBeGreaterThan(20)
    expect(data[1]).toBeLessThan(235)
  })

  it('zero-shift params on a matching pixel are an (approximate) no-op', () => {
    // With all shifts at 0 the HSL round-trip should reproduce the input
    // colour. The blend then collapses to the original — any drift is just
    // rounding noise from rgbToHsl ∘ hslToRgb.
    const data = px(255, 0, 0, 255)
    applyReplaceColor(
      data,
      withParams({ target: { r: 255, g: 0, b: 0 }, fuzziness: 40 }),
    )
    expect(data[0]).toBe(255)
    expect(data[1]).toBe(0)
    expect(data[2]).toBe(0)
  })
})
