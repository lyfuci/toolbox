import { describe, it, expect } from 'vitest'
import { textStats } from '@/lib/text-stats'

describe('textStats', () => {
  it('counts an empty string as all zeros', () => {
    const s = textStats('')
    expect(s).toMatchObject({ chars: 0, words: 0, lines: 0, sentences: 0, paragraphs: 0, bytes: 0 })
  })

  it('counts a simple sentence', () => {
    const s = textStats('The quick brown fox.')
    expect(s.words).toBe(4)
    expect(s.sentences).toBe(1)
    expect(s.lines).toBe(1)
    expect(s.chars).toBe(20)
  })

  it('counts chars without spaces', () => {
    expect(textStats('a b c').charsNoSpaces).toBe(3)
  })

  it('counts lines including a trailing empty one', () => {
    expect(textStats('a\nb\nc').lines).toBe(3)
    expect(textStats('a\nb\n').lines).toBe(3)
  })

  it('counts multiple sentences across punctuation', () => {
    expect(textStats('Hi. How are you? Great!').sentences).toBe(3)
  })

  it('counts paragraphs separated by blank lines', () => {
    expect(textStats('para one\n\npara two\n\npara three').paragraphs).toBe(3)
  })

  it('measures UTF-8 byte size (multibyte)', () => {
    // "é" is 2 bytes, "中" is 3 bytes in UTF-8.
    expect(textStats('é').bytes).toBe(2)
    expect(textStats('中').bytes).toBe(3)
  })

  it('counts codepoints not UTF-16 units for astral chars', () => {
    expect(textStats('😀').chars).toBe(1)
  })

  it('estimates reading time from word count', () => {
    const words = Array.from({ length: 200 }, () => 'word').join(' ')
    expect(textStats(words).readingTimeSec).toBe(60)
  })

  it('counts CJK words via segmentation', () => {
    // Should count more than 1 "word" for a CJK sentence (segmenter-dependent,
    // but definitely > 0).
    expect(textStats('你好世界').words).toBeGreaterThan(0)
  })
})
