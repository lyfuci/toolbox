import { describe, it, expect } from 'vitest'
import { applyRipple, DEFAULT_RIPPLE } from '../flt-ripple'
import type { RippleParams } from '../types'

/**
 * Node-only (no canvas / no DOM): hand-built RGBA buffers exercise the public
 * guarantees of the ripple displacement filter:
 *   1. a uniform image survives unchanged (exact equality — clamped tap of C is C),
 *   2. a sharp edge ripples (pixels near the boundary change),
 *   3. amount=0 is an exact identity,
 *   4. fractional source coordinates are bilinearly interpolated — a displaced
 *      interior pixel takes an intermediate value, proving non-nearest sampling.
 */

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

/** Horizontal 0→255 gradient; lets us spot interpolation at fractional x. */
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

describe('applyRipple', () => {
  it('ships the documented defaults', () => {
    expect(DEFAULT_RIPPLE).toEqual({ kind: 'ripple', amount: 50, size: 12 })
  })

  it('leaves a uniform image exactly unchanged', () => {
    const before = solid(32, 32, 30, 90, 210)
    const after = solid(32, 32, 30, 90, 210)
    applyRipple(after, 32, 32, { kind: 'ripple', amount: 80, size: 9 })
    expect(Array.from(after)).toEqual(Array.from(before))
  })

  it('is an exact identity when amount = 0', () => {
    const before = verticalEdge(40, 40)
    const after = verticalEdge(40, 40)
    applyRipple(after, 40, 40, { kind: 'ripple', amount: 0, size: 12 })
    expect(Array.from(after)).toEqual(Array.from(before))
  })

  it('ripples a sharp vertical edge — boundary pixels change', () => {
    const w = 48
    const h = 48
    const before = verticalEdge(w, h)
    const after = verticalEdge(w, h)
    applyRipple(after, w, h, { kind: 'ripple', amount: 60, size: 10 })

    let changed = 0
    for (let y = 0; y < h; y++) {
      for (let x = w / 2 - 12; x < w / 2 + 12; x++) {
        const i = (y * w + x) * 4
        if (after[i] !== before[i]) changed++
      }
    }
    expect(changed).toBeGreaterThan(0)
  })

  it('negative amount also displaces (sign just flips the phase)', () => {
    const w = 40
    const h = 40
    const before = verticalEdge(w, h)
    const after = verticalEdge(w, h)
    applyRipple(after, w, h, { kind: 'ripple', amount: -60, size: 10 })
    let changed = 0
    for (let i = 0; i < before.length; i += 4) {
      if (after[i] !== before[i]) changed++
    }
    expect(changed).toBeGreaterThan(0)
  })

  it('bilinear-interpolates fractional source coordinates (not nearest)', () => {
    // Horizontal displacement dx = peak * sin(2π·y / size), with
    //   peak = size * (amount/100) * 0.5.
    // Choose size=10, amount=100 → peak = 5. At y=2:
    //   dx = 5 * sin(4π/10) = 5 * sin(72°) ≈ 4.755 → safely fractional
    //   (y=1 lands ≈2.939, too close to integer 3, so we use y=2).
    const w = 32
    const h = 8
    const size = 10
    const amount = 100
    const params: RippleParams = { kind: 'ripple', amount, size }

    const src = horizontalGradient(w, h)
    const after = horizontalGradient(w, h)
    applyRipple(after, w, h, params)

    const y = 2
    const peak = size * (amount / 100) * 0.5
    const dx = peak * Math.sin((2 * Math.PI * y) / size)
    expect(Math.abs(dx - Math.round(dx))).toBeGreaterThan(0.2)

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

    expect(got).toBeGreaterThan(a)
    expect(got).toBeLessThan(b)
  })
})
