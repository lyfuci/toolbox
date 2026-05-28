import { describe, it, expect } from 'vitest'
import { applySurfaceBlur, DEFAULT_SURFACE_BLUR } from '../flt-surface-blur'

/**
 * Node-only tests (no canvas). Surface Blur's two defining behaviours:
 * it smooths a noisy FLAT region (variance drops), and it PRESERVES a
 * high-contrast edge (the black|white boundary never blends to grey because
 * the difference exceeds the range threshold). Plus radius 0 → identity.
 * We hand-build tiny RGBA buffers.
 */

function variance(d: Uint8ClampedArray): number {
  // Variance of the red channel across all pixels (grey buffers ⇒ R==G==B).
  let n = 0
  let mean = 0
  for (let i = 0; i < d.length; i += 4) {
    mean += d[i]
    n++
  }
  mean /= n
  let v = 0
  for (let i = 0; i < d.length; i += 4) {
    const dv = d[i] - mean
    v += dv * dv
  }
  return v / n
}

describe('applySurfaceBlur', () => {
  it('radius 0 is the identity', () => {
    const W = 5
    const H = 5
    const d = new Uint8ClampedArray(W * H * 4)
    for (let i = 0; i < d.length; i += 4) {
      d[i] = (i * 7) % 256
      d[i + 1] = (i * 13) % 256
      d[i + 2] = (i * 29) % 256
      d[i + 3] = 255
    }
    const before = Array.from(d)
    applySurfaceBlur(d, W, H, { kind: 'surfaceBlur', radius: 0, threshold: 25 })
    expect(Array.from(d)).toEqual(before)
  })

  it('smooths a noisy flat region — variance drops sharply', () => {
    const W = 16
    const H = 16
    const BASE = 128
    const d = new Uint8ClampedArray(W * H * 4)
    // Deterministic jitter around 128 within ±20 (inside the default threshold
    // of 25, so neighbours mostly qualify and get averaged together).
    let s = 12345
    const rand = () => {
      // LCG → reproducible noise, no Math.random.
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0
      return s / 4294967296
    }
    for (let i = 0; i < d.length; i += 4) {
      const v = BASE + Math.round((rand() - 0.5) * 40) // 128 ± 20
      d[i] = v
      d[i + 1] = v
      d[i + 2] = v
      d[i + 3] = 255
    }
    const vBefore = variance(d)
    applySurfaceBlur(d, W, H, { ...DEFAULT_SURFACE_BLUR })
    const vAfter = variance(d)
    // The flat field should be markedly smoother.
    expect(vAfter).toBeLessThan(vBefore * 0.5)
    expect(vBefore).toBeGreaterThan(10) // sanity: there was real noise to begin with
  })

  it('preserves a high-contrast black|white edge (no grey blend)', () => {
    const W = 12
    const H = 8
    const d = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = x < W / 2 ? 0 : 255 // hard vertical black|white edge
        const i = (y * W + x) * 4
        d[i] = v
        d[i + 1] = v
        d[i + 2] = v
        d[i + 3] = 255
      }
    }
    applySurfaceBlur(d, W, H, { ...DEFAULT_SURFACE_BLUR }) // radius 8, threshold 25
    // |255 - 0| = 255 ≫ 25, so neither side ever recruits the other side's
    // pixels. Every pixel stays exactly its original 0 or 255 — no grey.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = d[(y * W + x) * 4]
        expect([0, 255]).toContain(v)
      }
      // The boundary columns specifically must remain pure black / pure white.
      expect(d[(y * W + (W / 2 - 1)) * 4]).toBe(0)
      expect(d[(y * W + W / 2) * 4]).toBe(255)
    }
  })

  it('leaves alpha untouched', () => {
    const W = 6
    const H = 6
    const d = new Uint8ClampedArray(W * H * 4)
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 100
      d[i + 1] = 100
      d[i + 2] = 100
      d[i + 3] = 200 // distinctive alpha
    }
    applySurfaceBlur(d, W, H, { ...DEFAULT_SURFACE_BLUR })
    for (let i = 3; i < d.length; i += 4) expect(d[i]).toBe(200)
  })
})
