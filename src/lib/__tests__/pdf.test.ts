import { describe, it, expect } from 'vitest'
import { parsePageRange } from '@/lib/pdf-range'

describe('parsePageRange', () => {
  it('returns all pages for empty input', () => {
    expect(parsePageRange('', 3)).toEqual([1, 2, 3])
    expect(parsePageRange('   ', 3)).toEqual([1, 2, 3])
  })

  it('parses single pages and ranges', () => {
    expect(parsePageRange('1, 3', 5)).toEqual([1, 3])
    expect(parsePageRange('2-4', 5)).toEqual([2, 3, 4])
    expect(parsePageRange('1-2, 4, 5', 5)).toEqual([1, 2, 4, 5])
  })

  it('supports open-ended ranges', () => {
    expect(parsePageRange('3-', 5)).toEqual([3, 4, 5])
    expect(parsePageRange('-2', 5)).toEqual([1, 2])
  })

  it('deduplicates and sorts overlapping input', () => {
    expect(parsePageRange('3, 1-2, 2', 5)).toEqual([1, 2, 3])
  })

  it('normalizes reversed ranges', () => {
    expect(parsePageRange('4-2', 5)).toEqual([2, 3, 4])
  })

  it('clamps out-of-bounds pages to the document', () => {
    expect(parsePageRange('0, 3, 99', 5)).toEqual([3])
    expect(parsePageRange('4-100', 5)).toEqual([4, 5])
  })

  it('returns empty for unparseable tokens (signals invalid range)', () => {
    expect(parsePageRange('abc', 5)).toEqual([])
    expect(parsePageRange('1, foo', 5)).toEqual([])
  })
})
