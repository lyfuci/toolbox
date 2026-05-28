import { describe, it, expect } from 'vitest'
import {
  applyColorLookup,
  COLOR_LOOKUP_PRESETS,
  DEFAULT_COLOR_LOOKUP,
} from '../adj-color-lookup'
import type { ColorLookupParams } from '../types'

/**
 * Color Lookup applies a named procedural grade and blends it over the
 * original by `intensity`. We assert on hand-built RGBA buffers (no canvas):
 *   - intensity 0 is an exact identity;
 *   - the monochrome looks (bwFilm) are achromatic; sepia is warm (R>B);
 *   - intensity scales the blend monotonically;
 *   - every preset stays in 0..255 and never touches alpha.
 */
function px(...rgba: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(rgba)
}
function params(p: Partial<ColorLookupParams>): ColorLookupParams {
  return { ...DEFAULT_COLOR_LOOKUP, ...p }
}

describe('applyColorLookup', () => {
  it('intensity 0 is an exact identity for every preset', () => {
    for (const preset of COLOR_LOOKUP_PRESETS) {
      const d = px(10, 120, 240, 200)
      applyColorLookup(d, params({ preset, intensity: 0 }))
      expect(Array.from(d)).toEqual([10, 120, 240, 200])
    }
  })

  it('bwFilm produces an achromatic (R=G=B) result', () => {
    const d = px(200, 40, 90, 255)
    applyColorLookup(d, params({ preset: 'bwFilm', intensity: 100 }))
    expect(d[0]).toBe(d[1])
    expect(d[1]).toBe(d[2])
  })

  it('sepiaTone is warm — red channel exceeds blue on a neutral grey', () => {
    const d = px(128, 128, 128, 255)
    applyColorLookup(d, params({ preset: 'sepiaTone', intensity: 100 }))
    expect(d[0]).toBeGreaterThan(d[2])
  })

  it('intensity scales the blend monotonically toward the full grade', () => {
    const base = px(30, 60, 200, 255)
    const half = px(30, 60, 200, 255)
    const full = px(30, 60, 200, 255)
    applyColorLookup(half, params({ preset: 'warm', intensity: 50 }))
    applyColorLookup(full, params({ preset: 'warm', intensity: 100 }))
    // warm lifts red; the half-strength result sits between original and full.
    expect(half[0]).toBeGreaterThan(base[0])
    expect(half[0]).toBeLessThan(full[0])
  })

  it('keeps every channel in range and never touches alpha', () => {
    for (const preset of COLOR_LOOKUP_PRESETS) {
      const d = px(255, 0, 255, 137, 0, 255, 0, 42)
      applyColorLookup(d, params({ preset, intensity: 100 }))
      for (let i = 0; i < d.length; i++) {
        expect(d[i]).toBeGreaterThanOrEqual(0)
        expect(d[i]).toBeLessThanOrEqual(255)
      }
      expect(d[3]).toBe(137)
      expect(d[7]).toBe(42)
    }
  })
})
