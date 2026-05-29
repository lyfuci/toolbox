import { describe, it, expect } from 'vitest'
import { contentAwareFill } from '../content-aware-fill'

/**
 * Content-Aware Fill (multi-scale PatchMatch). Math.random drives the search,
 * so we assert convergence PROPERTIES on synthetic images, not exact pixels:
 *   - every hole pixel ends up filled with an in-range, opaque colour;
 *   - known pixels are passed through untouched;
 *   - a solid field fills back to that solid colour (sources are identical);
 *   - a hole inside one colour region fills from THAT region, not the other;
 *   - empty / full holes are no-ops.
 */

type Img = { data: Uint8ClampedArray; hole: Uint8Array; w: number; h: number }

function solid(w: number, h: number, rgb: [number, number, number]): Img {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = rgb[0]
    data[i * 4 + 1] = rgb[1]
    data[i * 4 + 2] = rgb[2]
    data[i * 4 + 3] = 255
  }
  return { data, hole: new Uint8Array(w * h), w, h }
}

function holeRect(img: Img, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) img.hole[y * img.w + x] = 1
}

describe('contentAwareFill', () => {
  it('fills every hole pixel with an in-range opaque colour', () => {
    const img = solid(40, 40, [180, 90, 40])
    holeRect(img, 14, 14, 26, 26)
    const out = contentAwareFill(img.data, img.w, img.h, img.hole)
    for (let p = 0; p < img.w * img.h; p++) {
      if (img.hole[p]) {
        for (let c = 0; c < 3; c++) {
          expect(out[p * 4 + c]).toBeGreaterThanOrEqual(0)
          expect(out[p * 4 + c]).toBeLessThanOrEqual(255)
        }
        expect(out[p * 4 + 3]).toBe(255)
      }
    }
  })

  it('leaves known pixels untouched', () => {
    const img = solid(40, 40, [180, 90, 40])
    holeRect(img, 14, 14, 26, 26)
    const out = contentAwareFill(img.data, img.w, img.h, img.hole)
    for (let p = 0; p < img.w * img.h; p++) {
      if (!img.hole[p]) {
        expect(out[p * 4]).toBe(img.data[p * 4])
        expect(out[p * 4 + 1]).toBe(img.data[p * 4 + 1])
        expect(out[p * 4 + 2]).toBe(img.data[p * 4 + 2])
      }
    }
  })

  it('fills a solid field back to (near) the same colour', () => {
    const img = solid(40, 40, [180, 90, 40])
    holeRect(img, 14, 14, 26, 26)
    const out = contentAwareFill(img.data, img.w, img.h, img.hole)
    // Sources are all identical, so the synthesized colour must match exactly.
    const center = (20 * img.w + 20) * 4
    expect(Math.abs(out[center] - 180)).toBeLessThanOrEqual(2)
    expect(Math.abs(out[center + 1] - 90)).toBeLessThanOrEqual(2)
    expect(Math.abs(out[center + 2] - 40)).toBeLessThanOrEqual(2)
  })

  it('fills a hole from its own colour region, not the far one', () => {
    // Left half red, right half blue; hole sits well inside the red half.
    const w = 64
    const h = 40
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const red = x < w / 2
        data[i] = red ? 200 : 20
        data[i + 1] = 20
        data[i + 2] = red ? 20 : 200
        data[i + 3] = 255
      }
    }
    const hole = new Uint8Array(w * h)
    for (let y = 16; y < 24; y++) for (let x = 10; x < 18; x++) hole[y * w + x] = 1
    const out = contentAwareFill(data, w, h, hole)
    const c = (20 * w + 14) * 4
    // Should read red-ish (R≫B), having matched the surrounding red region.
    expect(out[c]).toBeGreaterThan(out[c + 2])
    expect(out[c]).toBeGreaterThan(120)
  })

  it('is a no-op for an empty hole', () => {
    const img = solid(20, 20, [10, 20, 30])
    const out = contentAwareFill(img.data, img.w, img.h, img.hole)
    expect(Array.from(out)).toEqual(Array.from(img.data))
  })

  it('is a no-op when the whole image is a hole (nothing to sample)', () => {
    const img = solid(16, 16, [10, 20, 30])
    img.hole.fill(1)
    const out = contentAwareFill(img.data, img.w, img.h, img.hole)
    expect(Array.from(out)).toEqual(Array.from(img.data))
  })
})
