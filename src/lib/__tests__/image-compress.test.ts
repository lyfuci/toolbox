import { describe, it, expect } from 'vitest'
import {
  resolveOutput,
  fitDimensions,
  searchQualityForSize,
  pctChange,
  fmtBytes,
} from '@/lib/image-compress'

describe('resolveOutput', () => {
  it('keeps a re-encodable original format', () => {
    expect(resolveOutput('image/jpeg', 'original')).toEqual({ mime: 'image/jpeg', ext: 'jpg', lossy: true })
    expect(resolveOutput('image/webp', 'original')).toEqual({ mime: 'image/webp', ext: 'webp', lossy: true })
    expect(resolveOutput('image/png', 'original')).toEqual({ mime: 'image/png', ext: 'png', lossy: false })
  })
  it('falls back to PNG for formats the canvas cannot re-emit', () => {
    expect(resolveOutput('image/gif', 'original').mime).toBe('image/png')
    expect(resolveOutput('image/svg+xml', 'original').ext).toBe('png')
  })
  it('honours an explicit output format', () => {
    expect(resolveOutput('image/png', 'jpeg')).toEqual({ mime: 'image/jpeg', ext: 'jpg', lossy: true })
    expect(resolveOutput('image/jpeg', 'webp')).toEqual({ mime: 'image/webp', ext: 'webp', lossy: true })
    expect(resolveOutput('image/jpeg', 'png')).toEqual({ mime: 'image/png', ext: 'png', lossy: false })
  })
})

describe('fitDimensions', () => {
  it('leaves an image within the limit untouched', () => {
    expect(fitDimensions(800, 600, 1000)).toEqual({ width: 800, height: 600 })
    expect(fitDimensions(800, 600, null)).toEqual({ width: 800, height: 600 })
  })
  it('scales down by the longest side, keeping aspect', () => {
    expect(fitDimensions(4000, 2000, 1000)).toEqual({ width: 1000, height: 500 })
    expect(fitDimensions(2000, 4000, 1000)).toEqual({ width: 500, height: 1000 })
  })
  it('never upscales', () => {
    expect(fitDimensions(400, 300, 2000)).toEqual({ width: 400, height: 300 })
  })
  it('hard-caps enormous images at the canvas limit', () => {
    const { width } = fitDimensions(40000, 20000, null)
    expect(width).toBe(16384)
  })
})

describe('searchQualityForSize', () => {
  // Monotonic model: size grows with quality. Target picks the highest q under it.
  const sizeAt = (q: number) => Promise.resolve(q * 1000)
  it('finds the highest quality whose size fits the target', async () => {
    const q = await searchQualityForSize(sizeAt, 70_000, 30, 95, 7)
    expect(q).toBe(70) // 70*1000 = 70000 ≤ target; 71 would exceed
    expect(q * 1000).toBeLessThanOrEqual(70_000)
  })
  it('returns minQ when even the lowest quality overshoots', async () => {
    const q = await searchQualityForSize(sizeAt, 1000, 30, 95, 7)
    expect(q).toBe(30)
  })
  it('returns maxQ when everything fits', async () => {
    const q = await searchQualityForSize(sizeAt, 10_000_000, 30, 95, 7)
    expect(q).toBe(95)
  })
})

describe('pctChange / fmtBytes', () => {
  it('reports negative percent when smaller', () => {
    expect(pctChange(1000, 400)).toBe(-60)
    expect(pctChange(1000, 1300)).toBe(30)
    expect(pctChange(0, 500)).toBe(0)
  })
  it('formats bytes', () => {
    expect(fmtBytes(512)).toBe('512 B')
    expect(fmtBytes(2048)).toBe('2.0 KB')
    expect(fmtBytes(3_500_000)).toBe('3.34 MB')
  })
})
