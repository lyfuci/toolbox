import { describe, it, expect } from 'vitest'
import { inspect, inspectChar } from '@/lib/unicode-inspect'

describe('inspectChar', () => {
  it('describes ASCII A', () => {
    const i = inspectChar('A')
    expect(i.codePoint).toBe(65)
    expect(i.hex).toBe('U+0041')
    expect(i.utf8).toBe('41')
    expect(i.category).toBe('Letter')
  })

  it('describes a tab as a named control char', () => {
    const i = inspectChar('\t')
    expect(i.hex).toBe('U+0009')
    expect(i.name).toContain('TABULATION')
    expect(i.category).toBe('Control')
  })

  it('describes a CJK ideograph with multi-byte UTF-8', () => {
    const i = inspectChar('中')
    expect(i.hex).toBe('U+4E2D')
    expect(i.utf8).toBe('E4 B8 AD')
    expect(i.name).toContain('CJK')
  })

  it('describes an emoji with a surrogate-pair UTF-16', () => {
    const i = inspectChar('😀')
    expect(i.codePoint).toBe(0x1f600)
    expect(i.hex).toBe('U+1F600')
    expect(i.utf16.split(' ')).toHaveLength(2)
    expect(i.utf8.split(' ')).toHaveLength(4)
  })

  it('flags a zero-width space by name', () => {
    expect(inspectChar('​').name).toContain('ZERO WIDTH SPACE')
  })
})

describe('inspect', () => {
  it('splits astral characters into single codepoints', () => {
    const list = inspect('a😀b')
    expect(list).toHaveLength(3)
    expect(list[1].codePoint).toBe(0x1f600)
  })

  it('returns an empty array for empty input', () => {
    expect(inspect('')).toEqual([])
  })
})
