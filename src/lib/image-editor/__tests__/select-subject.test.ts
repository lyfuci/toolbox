import { describe, it, expect } from 'vitest'
import { selectSubject } from '../select-subject'

/**
 * Tests for the saliency-based Select Subject heuristic. Because the pipeline
 * (Otsu threshold + morphology + largest-component + hole-fill) is inherently
 * approximate, we build buffers with a STRONG, unambiguous signal — a dark
 * blob on a light field — and assert with generous tolerances on the bbox
 * rather than exact pixels. Pure RGBA typed arrays only; no canvas / DOM.
 */
function makeImage(
  w: number,
  h: number,
  color: (x: number, y: number) => [number, number, number],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const [r, g, b] = color(x, y)
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return data
}

describe('selectSubject', () => {
  it('detects a centred dark circle on a light background', () => {
    const w = 80
    const h = 80
    const cx = (w - 1) / 2
    const cy = (h - 1) / 2
    const r = 20
    const data = makeImage(w, h, (x, y) => {
      const inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r
      return inside ? [30, 30, 30] : [220, 220, 220]
    })

    const result = selectSubject(data, w, h)
    expect(result).not.toBeNull()
    const { path, bbox } = result!

    // A real polygon came back.
    expect(path.length).toBeGreaterThanOrEqual(3)

    // bbox centre should land near the image centre (within ±6 px).
    const bcx = bbox.x + bbox.w / 2
    const bcy = bbox.y + bbox.h / 2
    expect(Math.abs(bcx - cx)).toBeLessThan(6)
    expect(Math.abs(bcy - cy)).toBeLessThan(6)

    // bbox should roughly cover the blob diameter (2r = 40), allowing the
    // morphology to grow/shrink the silhouette a bit: 0.5×–1.5× of true size.
    const diameter = 2 * r
    expect(bbox.w).toBeGreaterThan(diameter * 0.5)
    expect(bbox.w).toBeLessThan(diameter * 1.5)
    expect(bbox.h).toBeGreaterThan(diameter * 0.5)
    expect(bbox.h).toBeLessThan(diameter * 1.5)
  })

  it('detects a centred dark square on a light background', () => {
    const w = 80
    const h = 80
    const data = makeImage(w, h, (x, y) => {
      const inside = x >= 28 && x < 52 && y >= 28 && y < 52
      return inside ? [40, 40, 40] : [210, 210, 210]
    })

    const result = selectSubject(data, w, h)
    expect(result).not.toBeNull()
    const { bbox } = result!
    const bcx = bbox.x + bbox.w / 2
    const bcy = bbox.y + bbox.h / 2
    expect(Math.abs(bcx - 40)).toBeLessThan(6)
    expect(Math.abs(bcy - 40)).toBeLessThan(6)
  })

  it('returns null for a uniform image (no subject)', () => {
    const w = 60
    const h = 60
    const data = makeImage(w, h, () => [128, 128, 128])
    expect(selectSubject(data, w, h)).toBeNull()
  })

  it('returns null when the "subject" fills the whole frame', () => {
    // A dark frame with no contrasting background — saliency has no edge to
    // latch onto, so this should be rejected as degenerate (full or empty).
    const w = 60
    const h = 60
    const data = makeImage(w, h, () => [20, 20, 20])
    expect(selectSubject(data, w, h)).toBeNull()
  })

  it('does not crash on a tiny buffer and returns null', () => {
    const w = 2
    const h = 2
    const data = makeImage(w, h, () => [100, 150, 200])
    // Whatever the heuristic decides, it must not throw.
    expect(() => selectSubject(data, w, h)).not.toThrow()
  })

  it('returns null on malformed/short buffers', () => {
    const data = new Uint8ClampedArray(10) // far too small for 8×8
    expect(selectSubject(data, 8, 8)).toBeNull()
  })
})
