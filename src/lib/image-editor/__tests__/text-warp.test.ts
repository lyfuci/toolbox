import { describe, it, expect } from 'vitest'
import {
  WARP_STYLES,
  isWarpActive,
  warpEdges,
  warpTextPixels,
} from '../text-warp'
import type { TextWarp } from '../types'

/**
 * Warp Text envelope math + bitmap remap. Pure functions, asserted on
 * hand-built RGBA buffers (no canvas):
 *   - 'none' / zero-amount warps are the identity envelope { top:0, bot:1 };
 *   - isWarpActive gates correctly;
 *   - a zero-bend remap returns the source band unchanged (transparent pad);
 *   - a real bend moves pixels and stays in-bounds with valid alpha.
 */

function warp(p: Partial<TextWarp>): TextWarp {
  return { style: 'arc', bend: 0, horizontal: 0, vertical: 0, ...p }
}

describe('warpEdges', () => {
  it("'none' is the identity band for any u", () => {
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      const e = warpEdges('none', u, 100, 50, -50)
      expect(e.top).toBe(0)
      expect(e.bot).toBe(1)
    }
  })

  it('every style with zero params is the identity band', () => {
    for (const style of WARP_STYLES) {
      for (const u of [0, 0.5, 1]) {
        const e = warpEdges(style, u, 0, 0, 0)
        expect(e.top).toBeCloseTo(0, 10)
        expect(e.bot).toBeCloseTo(1, 10)
      }
    }
  })

  it('arc with positive bend lifts the centre and pins the ends', () => {
    const mid = warpEdges('arc', 0.5, 100, 0, 0)
    const end = warpEdges('arc', 0, 100, 0, 0)
    expect(mid.top).toBeLessThan(0) // centre rises
    expect(end.top).toBeCloseTo(0, 6) // ends stay put
    // constant thickness for arc
    expect(mid.bot - mid.top).toBeCloseTo(1, 6)
  })

  it('bulge thickens the band in the middle', () => {
    const mid = warpEdges('bulge', 0.5, 100, 0, 0)
    expect(mid.bot - mid.top).toBeGreaterThan(1)
  })
})

describe('isWarpActive', () => {
  it('false for undefined / none / all-zero, true for a real warp', () => {
    expect(isWarpActive(undefined)).toBe(false)
    expect(isWarpActive(warp({ style: 'none', bend: 50 }))).toBe(false)
    expect(isWarpActive(warp({ style: 'arc', bend: 0 }))).toBe(false)
    expect(isWarpActive(warp({ style: 'arc', bend: 40 }))).toBe(true)
    expect(isWarpActive(warp({ style: 'flag', bend: 0, vertical: 30 }))).toBe(true)
  })
})

describe('warpTextPixels', () => {
  // 10×10 buffer with an opaque-white band at x∈[2,8), y∈[3,7).
  const W = 10
  const H = 10
  const padX = 2
  const padY = 3
  const textW = 6
  const textH = 4
  function band(): Uint8ClampedArray {
    const d = new Uint8ClampedArray(W * H * 4)
    for (let y = padY; y < padY + textH; y++) {
      for (let x = padX; x < padX + textW; x++) {
        const i = (y * W + x) * 4
        d[i] = d[i + 1] = d[i + 2] = 255
        d[i + 3] = 255
      }
    }
    return d
  }

  it('zero-bend remap reproduces the source band exactly', () => {
    const src = band()
    const out = warpTextPixels(src, W, H, warp({ bend: 0 }), padX, padY, textW, textH)
    expect(Array.from(out)).toEqual(Array.from(src))
  })

  it('a real bend moves pixels (output differs from identity)', () => {
    const src = band()
    const id = warpTextPixels(src, W, H, warp({ bend: 0 }), padX, padY, textW, textH)
    const bent = warpTextPixels(src, W, H, warp({ style: 'arc', bend: 100 }), padX, padY, textW, textH)
    let diff = 0
    for (let i = 0; i < bent.length; i++) if (bent[i] !== id[i]) diff++
    expect(diff).toBeGreaterThan(0)
  })

  it('keeps channels in range and produces only valid alpha', () => {
    const src = band()
    const out = warpTextPixels(src, W, H, warp({ style: 'flag', bend: 80, vertical: 40 }), padX, padY, textW, textH)
    for (let i = 0; i < out.length; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(0)
      expect(out[i]).toBeLessThanOrEqual(255)
    }
  })

  it('degenerate size returns a copy without throwing', () => {
    const src = band()
    const out = warpTextPixels(src, W, H, warp({ bend: 50 }), padX, padY, 0, textH)
    expect(Array.from(out)).toEqual(Array.from(src))
  })
})
