import { describe, it, expect } from 'vitest'
import { proceduralPeaks, peakColumnRange, WAVE_COLS } from '@/lib/timeline/waveform'

describe('proceduralPeaks', () => {
  it('is deterministic per sourceId and in [0,1]', () => {
    const a = proceduralPeaks('src_abc', 64)
    const b = proceduralPeaks('src_abc', 64)
    expect(Array.from(a)).toEqual(Array.from(b))
    expect(a.length).toBe(64)
    for (const v of a) expect(v).toBeGreaterThanOrEqual(0)
    for (const v of a) expect(v).toBeLessThanOrEqual(1)
  })
  it('differs between sources', () => {
    const a = proceduralPeaks('src_a', 64)
    const b = proceduralPeaks('src_b', 64)
    expect(Array.from(a)).not.toEqual(Array.from(b))
  })
  it('is not flat (has variation)', () => {
    const a = proceduralPeaks('src_variation', 128)
    const min = Math.min(...a)
    const max = Math.max(...a)
    expect(max - min).toBeGreaterThan(0.1)
  })
})

describe('peakColumnRange', () => {
  it('maps a source window to column indices', () => {
    const { start, end } = peakColumnRange(0, 5, 10, 100) // first half
    expect(start).toBe(0)
    expect(end).toBe(50)
  })
  it('maps a mid window', () => {
    const { start, end } = peakColumnRange(2, 8, 10, 100)
    expect(start).toBe(20)
    expect(end).toBe(80)
  })
  it('clamps and guarantees end > start', () => {
    const { start, end } = peakColumnRange(9.99, 10, 10, WAVE_COLS)
    expect(start).toBeLessThan(WAVE_COLS)
    expect(end).toBeGreaterThan(start)
    expect(end).toBeLessThanOrEqual(WAVE_COLS)
  })
  it('tolerates zero duration', () => {
    const { start, end } = peakColumnRange(0, 0, 0, 100)
    expect(end).toBeGreaterThan(start)
  })
})
