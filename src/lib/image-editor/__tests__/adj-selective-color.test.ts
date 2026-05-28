import { describe, it, expect } from 'vitest'
import { applySelectiveColor, DEFAULT_SELECTIVE_COLOR } from '../adj-selective-color'
import type { SelectiveColorParams, SelectiveColorRange } from '../types'

/**
 * Selective Color edits CMYK components grouped by color range. We assert on
 * hand-built RGBA buffers (no canvas):
 *   - default (all-zero) params are an exact identity;
 *   - a pure red with reds.c = +100 absolute pushes cyan to full, which
 *     subtractively kills the red channel (cyan-reduced red);
 *   - the neutrals range moves a gray pixel;
 *   - relative and absolute modes produce different results from the same
 *     non-zero delta.
 */
function px(...rgba: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(rgba)
}

const Z: SelectiveColorRange = { c: 0, m: 0, y: 0, k: 0 }

/** Build params with a single range overridden, everything else zeroed. */
function withRange(
  name: keyof SelectiveColorParams['ranges'],
  range: SelectiveColorRange,
  mode: SelectiveColorParams['mode'] = 'relative',
): SelectiveColorParams {
  return {
    kind: 'selectiveColor',
    mode,
    ranges: {
      reds: { ...Z },
      yellows: { ...Z },
      greens: { ...Z },
      cyans: { ...Z },
      blues: { ...Z },
      magentas: { ...Z },
      whites: { ...Z },
      neutrals: { ...Z },
      blacks: { ...Z },
      [name]: range,
    },
  }
}

describe('applySelectiveColor', () => {
  it('default (all-zero) params are an exact identity', () => {
    const data = px(128, 200, 50, 255, 10, 10, 10, 200, 240, 240, 240, 99)
    const before = Array.from(data)
    applySelectiveColor(data, DEFAULT_SELECTIVE_COLOR)
    expect(Array.from(data)).toEqual(before)
  })

  it('pure red + reds.c = +100 absolute → cyan-reduced (red channel collapses)', () => {
    const data = px(255, 0, 0, 255)
    applySelectiveColor(data, withRange('reds', { ...Z, c: 100 }, 'absolute'))
    // RGB→CMYK of pure red is (C0,M1,Y1,K0). Adding +1 cyan absolute → C=1,
    // so R = 255·(1-C) = 0. Red is "reduced" by the added cyan.
    expect(data[0]).toBeLessThan(20)
  })

  it('neutrals range affects a gray pixel', () => {
    const data = px(128, 128, 128, 255)
    // Add cyan + magenta + yellow absolutely → darkens the neutral.
    applySelectiveColor(
      data,
      withRange('neutrals', { c: 50, m: 50, y: 50, k: 0 }, 'absolute'),
    )
    expect(data[0]).toBeLessThan(128)
  })

  it('neutrals range leaves a fully-saturated pixel essentially untouched', () => {
    const gray = px(128, 128, 128, 255)
    const red = px(255, 0, 0, 255)
    const p = withRange('neutrals', { c: 40, m: 0, y: 0, k: 0 }, 'absolute')
    applySelectiveColor(gray, p)
    applySelectiveColor(red, p)
    // The neutrals membership is weighted by (1 - saturation): the gray moves,
    // the vivid red barely does.
    const grayMoved = Math.abs(gray[0] - 128)
    const redMoved = Math.abs(red[0] - 255)
    expect(grayMoved).toBeGreaterThan(redMoved)
  })

  it('relative and absolute modes differ on the same delta', () => {
    // Yellow has CMYK (0,0,1,0). reds touches red-family; use yellows here.
    const rel = px(255, 255, 0, 255)
    const abs = px(255, 255, 0, 255)
    const range: SelectiveColorRange = { ...Z, c: 60 }
    applySelectiveColor(rel, withRange('yellows', range, 'relative'))
    applySelectiveColor(abs, withRange('yellows', range, 'absolute'))
    // Relative scales existing cyan (which is 0 for yellow → no change to C),
    // absolute adds cyan from nothing → the two results diverge.
    expect(Array.from(rel.slice(0, 3))).not.toEqual(Array.from(abs.slice(0, 3)))
  })

  it('leaves alpha untouched', () => {
    const data = px(200, 50, 50, 171)
    applySelectiveColor(data, withRange('reds', { ...Z, m: 50 }, 'absolute'))
    expect(data[3]).toBe(171)
  })
})
