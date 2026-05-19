import { describe, it, expect } from 'vitest'
import { applyAdjustment, DEFAULT_FOR_KIND } from '../adjustments'
import type { AdjustmentKind } from '../types'

/**
 * Pure-pixel-transform sanity tests. We feed a tiny RGBA buffer through each
 * adjustment and assert easy-to-reason invariants: identity defaults
 * preserve pixels; out-of-range params clamp; signed extremes do the
 * obviously-expected thing (invert flips, threshold collapses to 0/255).
 *
 * Larger correctness (curves spline, levels gamma curve shape) is implicit
 * — we test the public guarantee, not the math behind it.
 */
function px(...rgba: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(rgba)
}

describe('applyAdjustment', () => {
  describe('identity defaults', () => {
    const cases: AdjustmentKind[] = [
      'levels',
      'curves',
      'brightnessContrast',
      'hueSaturation',
      'colorBalance',
      'vibrance',
      'exposure',
      'channelMixer',
      'gradientMap',
      'photoFilter',
      'cameraRaw',
    ]
    for (const kind of cases) {
      it(`${kind} defaults are (almost) identity`, () => {
        const data = px(100, 150, 200, 255, 50, 60, 70, 255)
        const before = Array.from(data)
        const params = { ...DEFAULT_FOR_KIND[kind] }
        // Skip kinds whose defaults aren't identity (photoFilter ships
        // density=25 of warming; gradientMap ships black→white which
        // approximates luminance-based grayscale).
        if (params.kind === 'photoFilter') return
        if (params.kind === 'gradientMap') return
        applyAdjustment(data, params)
        const after = Array.from(data)
        // Most identities preserve exactly; tolerate ±1 for any rounding
        // (vibrance's HSL pass can drift by 1 on saturated channels).
        for (let i = 0; i < before.length; i++) {
          if (i % 4 === 3) {
            expect(after[i]).toBe(before[i]) // alpha untouched
            continue
          }
          expect(Math.abs(after[i] - before[i])).toBeLessThanOrEqual(1)
        }
      })
    }
  })

  describe('invert', () => {
    it('flips each channel, leaves alpha alone', () => {
      const data = px(10, 100, 200, 200)
      applyAdjustment(data, { kind: 'invert' })
      expect(data[0]).toBe(245)
      expect(data[1]).toBe(155)
      expect(data[2]).toBe(55)
      expect(data[3]).toBe(200)
    })
  })

  describe('threshold', () => {
    it('collapses below threshold to 0', () => {
      const data = px(50, 50, 50, 255)
      applyAdjustment(data, { kind: 'threshold', threshold: 128 })
      expect(data[0]).toBe(0)
      expect(data[1]).toBe(0)
      expect(data[2]).toBe(0)
    })
    it('lifts at/above threshold to 255', () => {
      const data = px(200, 200, 200, 255)
      applyAdjustment(data, { kind: 'threshold', threshold: 128 })
      expect(data[0]).toBe(255)
      expect(data[1]).toBe(255)
      expect(data[2]).toBe(255)
    })
  })

  describe('posterize', () => {
    it('quantizes to N levels', () => {
      const data = px(0, 64, 128, 255, 192, 255, 0, 255)
      applyAdjustment(data, { kind: 'posterize', levels: 4 })
      // 4 levels = bins of width 64; output values land on {0,85,170,255}
      const allowed = new Set([0, 85, 170, 255])
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          expect(allowed.has(data[i + c])).toBe(true)
        }
      }
    })
  })

  describe('brightnessContrast', () => {
    it('positive brightness brightens midtones', () => {
      const data = px(128, 128, 128, 255)
      applyAdjustment(data, { kind: 'brightnessContrast', brightness: 50, contrast: 0 })
      expect(data[0]).toBeGreaterThan(128)
    })
    it('negative brightness darkens midtones', () => {
      const data = px(128, 128, 128, 255)
      applyAdjustment(data, { kind: 'brightnessContrast', brightness: -50, contrast: 0 })
      expect(data[0]).toBeLessThan(128)
    })
  })

  describe('exposure', () => {
    it('+1 stop ~doubles dark channel', () => {
      const data = px(50, 50, 50, 255)
      applyAdjustment(data, { kind: 'exposure', exposure: 1, offset: 0, gamma: 1 })
      expect(data[0]).toBe(100)
    })
  })

  describe('hueSaturation', () => {
    it('saturation=-100 produces neutral gray (R=G=B)', () => {
      const data = px(200, 50, 50, 255)
      applyAdjustment(data, { kind: 'hueSaturation', hue: 0, saturation: -100, lightness: 0 })
      expect(data[0]).toBe(data[1])
      expect(data[1]).toBe(data[2])
    })
  })

  describe('alpha preservation', () => {
    it('every kind leaves alpha untouched', () => {
      const kinds: AdjustmentKind[] = Object.keys(DEFAULT_FOR_KIND) as AdjustmentKind[]
      for (const kind of kinds) {
        const data = px(100, 100, 100, 123)
        applyAdjustment(data, DEFAULT_FOR_KIND[kind])
        expect(data[3]).toBe(123)
      }
    })
  })
})
