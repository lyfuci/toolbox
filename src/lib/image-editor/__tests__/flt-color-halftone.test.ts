import { describe, it, expect } from 'vitest'
import { applyColorHalftone, DEFAULT_COLOR_HALFTONE } from '../flt-color-halftone'

/**
 * Node-only tests (no canvas). Halftone's defining behaviours: white has no
 * ink so it stays (near-)white with no dots; a dark/saturated area produces
 * dots — meaning after screening both near-black AND near-white pixels exist
 * (the dot + the gaps between dots). And it's deterministic.
 */

function fillRGB(
  w: number,
  h: number,
  rgb: [number, number, number],
): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < d.length; i += 4) {
    d[i] = rgb[0]
    d[i + 1] = rgb[1]
    d[i + 2] = rgb[2]
    d[i + 3] = 255
  }
  return d
}

function luma(d: Uint8ClampedArray, i: number): number {
  return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
}

describe('applyColorHalftone', () => {
  const W = 64
  const H = 64

  it('keeps a pure-white area white (no ink → no dots)', () => {
    const d = fillRGB(W, H, [255, 255, 255])
    applyColorHalftone(d, W, H, { ...DEFAULT_COLOR_HALFTONE })
    // White → zero CMYK → every pixel stays full white.
    for (let i = 0; i < d.length; i += 4) {
      expect(d[i]).toBeGreaterThanOrEqual(250)
      expect(d[i + 1]).toBeGreaterThanOrEqual(250)
      expect(d[i + 2]).toBeGreaterThanOrEqual(250)
    }
  })

  it('produces dots in a black area: both dark and light pixels exist', () => {
    const d = fillRGB(W, H, [0, 0, 0])
    applyColorHalftone(d, W, H, { ...DEFAULT_COLOR_HALFTONE, dotRadius: 4 })
    let dark = 0
    let light = 0
    for (let i = 0; i < d.length; i += 4) {
      const l = luma(d, i)
      if (l < 40) dark++
      if (l > 200) light++
    }
    // The dots themselves are dark; the corner gaps between inscribed dots
    // are light. A real halftone screen of solid black must show both.
    expect(dark).toBeGreaterThan(0)
    expect(light).toBeGreaterThan(0)
  })

  it('produces dots for a saturated color too', () => {
    // Saturated red → strong M and Y ink, zero C, no K.
    const d = fillRGB(W, H, [255, 0, 0])
    applyColorHalftone(d, W, H, { ...DEFAULT_COLOR_HALFTONE, dotRadius: 4 })
    const colors = new Set<string>()
    for (let i = 0; i < d.length; i += 4) {
      colors.add(`${d[i]},${d[i + 1]},${d[i + 2]}`)
    }
    // Screening a flat color must create variation (dots vs gaps), not a flat
    // fill — so more than one distinct color appears.
    expect(colors.size).toBeGreaterThan(1)
  })

  it('is deterministic: same params → byte-identical output', () => {
    const mk = () => {
      const d = new Uint8ClampedArray(W * H * 4)
      for (let p = 0; p < W * H; p++) {
        const di = p * 4
        d[di] = (p * 11) % 256
        d[di + 1] = (p * 17) % 256
        d[di + 2] = (p * 23) % 256
        d[di + 3] = 255
      }
      return d
    }
    const a = mk()
    const b = mk()
    applyColorHalftone(a, W, H, { ...DEFAULT_COLOR_HALFTONE })
    applyColorHalftone(b, W, H, { ...DEFAULT_COLOR_HALFTONE })
    expect(Array.from(a)).toEqual(Array.from(b))
  })
})
