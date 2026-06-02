import { describe, it, expect } from 'vitest'
import { slugify } from '@/lib/slugify'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })
  it('strips diacritics', () => {
    expect(slugify('Crème Brûlée à Paris')).toBe('creme-brulee-a-paris')
  })
  it('collapses runs of punctuation/space into one separator', () => {
    expect(slugify('a  --  b___c!!!d')).toBe('a-b-c-d')
  })
  it('trims separators from the ends', () => {
    expect(slugify('  --hello--  ')).toBe('hello')
  })
  it('honours a custom separator', () => {
    expect(slugify('Hello World', { separator: '_' })).toBe('hello_world')
  })
  it('can preserve case', () => {
    expect(slugify('Hello World', { lowercase: false })).toBe('Hello-World')
  })
  it('drops non-latin by default', () => {
    expect(slugify('北京 city')).toBe('city')
  })
  it('keeps unicode letters when asked', () => {
    expect(slugify('北京 city', { keepUnicode: true })).toBe('北京-city')
  })
  it('keeps numbers', () => {
    expect(slugify('Top 10 Tips')).toBe('top-10-tips')
  })
  it('truncates to maxLength without trailing separator', () => {
    expect(slugify('the quick brown fox', { maxLength: 9 })).toBe('the-quick')
  })
  it('returns empty string for all-punctuation input', () => {
    expect(slugify('!!!')).toBe('')
  })
})
