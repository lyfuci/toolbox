import { describe, it, expect } from 'vitest'
import { formatTC, frameDuration } from '@/lib/timeline/timecode'

describe('formatTC', () => {
  it('formats zero', () => {
    expect(formatTC(0, 30)).toBe('00:00:00:00')
  })
  it('formats sub-second frames', () => {
    expect(formatTC(0.5, 30)).toBe('00:00:00:15')
    expect(formatTC(1 / 30, 30)).toBe('00:00:00:01')
  })
  it('rounds to the nearest frame and never shows frame == fps (carries)', () => {
    // Round-to-nearest-frame (robust vs float): round(1.98*30)=59 → :01:29.
    expect(formatTC(1.98, 30)).toBe('00:00:01:29')
    // round(1.999*30)=60 carries to the next second — never :01:30.
    expect(formatTC(1.999, 30)).toBe('00:00:02:00')
  })
  it('formats minutes and hours', () => {
    expect(formatTC(61, 30)).toBe('00:01:01:00')
    expect(formatTC(3661.5, 30)).toBe('01:01:01:15')
  })
  it('respects fps', () => {
    expect(formatTC(0.5, 24)).toBe('00:00:00:12')
    expect(formatTC(0.5, 60)).toBe('00:00:00:30')
  })
  it('clamps negatives to zero', () => {
    expect(formatTC(-5, 30)).toBe('00:00:00:00')
  })
  it('tolerates a zero/NaN fps by falling back to 30', () => {
    expect(formatTC(1, 0)).toBe('00:00:01:00')
    expect(formatTC(1, Number.NaN)).toBe('00:00:01:00')
  })
})

describe('frameDuration', () => {
  it('is 1/fps', () => {
    expect(frameDuration(30)).toBeCloseTo(1 / 30)
    expect(frameDuration(24)).toBeCloseTo(1 / 24)
  })
  it('falls back to 30 for bad fps', () => {
    expect(frameDuration(0)).toBeCloseTo(1 / 30)
  })
})
