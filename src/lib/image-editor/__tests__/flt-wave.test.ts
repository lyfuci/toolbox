import { describe, it, expect } from 'vitest'
import { applyWave, DEFAULT_WAVE } from '../flt-wave'
import type { WaveParams } from '../types'

/**
 * Node-only (no canvas / no DOM): we hand-build RGBA buffers and exercise the
 * public guarantees of a displacement filter:
 *   1. a uniform image survives the displacement unchanged (a clamped tap of
 *      colour C is still C, so this is an *exact* equality, not approximate),
 *   2. a sharp edge actually waves (pixels near the boundary change),
 *   3. amplitude=0 is an exact identity,
 *   4. fractional source coordinates are bilinearly interpolated — a displaced
 *      interior pixel takes a value *between* two source colours, proving we
 *      didn't nearest-sample.
 */

/** Build a uniform-colour opaque RGBA buffer. */
function solid(w: number, h: number, r: number, g: number, b: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  }
  return data
}

/** Left half black, right half white — a sharp vertical edge at x = w/2. */
function verticalEdge(w: number, h: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = x < w / 2 ? 0 : 255
      const i = (y * w + x) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return data
}

/**
 * Horizontal gradient: value rises linearly with x from 0 to nearly 255. Used
 * to detect interpolation — at a fractional x the bilinear result lands between
 * two adjacent integer-column values.
 */
function horizontalGradient(w: number, h: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round((x / (w - 1)) * 255)
      const i = (y * w + x) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return data
}

describe('applyWave', () => {
  it('ships the documented defaults', () => {
    expect(DEFAULT_WAVE).toEqual({
      kind: 'wave',
      amplitude: 20,
      wavelength: 80,
      type: 'sine',
    })
  })

  it('leaves a uniform image exactly unchanged (clamped tap of C is C)', () => {
    const before = solid(32, 32, 120, 60, 200)
    const after = solid(32, 32, 120, 60, 200)
    applyWave(after, 32, 32, { kind: 'wave', amplitude: 20, wavelength: 13, type: 'sine' })
    expect(Array.from(after)).toEqual(Array.from(before))
  })

  it('is an exact identity when amplitude = 0', () => {
    const before = verticalEdge(40, 40)
    const after = verticalEdge(40, 40)
    applyWave(after, 40, 40, { kind: 'wave', amplitude: 0, wavelength: 30, type: 'sine' })
    expect(Array.from(after)).toEqual(Array.from(before))
  })

  it('waves a sharp vertical edge — pixels near the boundary change', () => {
    const w = 48
    const h = 48
    const before = verticalEdge(w, h)
    const after = verticalEdge(w, h)
    applyWave(after, w, h, { kind: 'wave', amplitude: 8, wavelength: 24, type: 'sine' })

    // Count pixels (R channel) that differ along the boundary band.
    let changed = 0
    for (let y = 0; y < h; y++) {
      for (let x = w / 2 - 10; x < w / 2 + 10; x++) {
        const i = (y * w + x) * 4
        if (after[i] !== before[i]) changed++
      }
    }
    expect(changed).toBeGreaterThan(0)
  })

  it('triangle waveform also displaces a sharp edge', () => {
    const w = 48
    const h = 48
    const before = verticalEdge(w, h)
    const after = verticalEdge(w, h)
    applyWave(after, w, h, { kind: 'wave', amplitude: 8, wavelength: 24, type: 'triangle' })
    let changed = 0
    for (let i = 0; i < before.length; i += 4) {
      if (after[i] !== before[i]) changed++
    }
    expect(changed).toBeGreaterThan(0)
  })

  it('bilinear-interpolates fractional source coordinates (not nearest)', () => {
    // We need a known fractional horizontal displacement at an interior pixel.
    // dx = amplitude * sin(2π·y / wavelength). Choose wavelength so dx is a
    // clean non-integer at a chosen row. amplitude=6, wavelength=24, y=2:
    //   dx = 6 * sin(2π·2/24) = 6 * sin(π/6) = 6 * 0.5 = 3.0  → integer, bad.
    // Instead pick y=1: dx = 6 * sin(2π/24) = 6 * sin(π/12) ≈ 1.553 → fractional.
    const w = 32
    const h = 8
    const amplitude = 6
    const wavelength = 24
    const params: WaveParams = { kind: 'wave', amplitude, wavelength, type: 'sine' }

    const src = horizontalGradient(w, h)
    const after = horizontalGradient(w, h)
    applyWave(after, w, h, params)

    const y = 1
    const dx = amplitude * Math.sin((2 * Math.PI * y) / wavelength)
    // Sanity: the displacement must actually be fractional for this test to mean
    // anything.
    expect(Math.abs(dx - Math.round(dx))).toBeGreaterThan(0.2)

    // Pick an interior column whose displaced source x stays well inside [0,w-1]
    // (so no edge clamping) and where vertical displacement doesn't matter
    // (gradient is purely horizontal, so dy can't change the sampled value).
    const x = 16
    const fx = x + dx
    const x0 = Math.floor(fx)
    const x1 = x0 + 1

    const i = (y * w + x) * 4
    const got = after[i]
    const lo = src[(y * w + x0) * 4]
    const hi = src[(y * w + x1) * 4]
    const a = Math.min(lo, hi)
    const b = Math.max(lo, hi)

    // The interpolated value must be strictly between the two bracketing source
    // columns — nearest-sampling would return exactly one of them.
    expect(got).toBeGreaterThan(a)
    expect(got).toBeLessThan(b)
  })
})
