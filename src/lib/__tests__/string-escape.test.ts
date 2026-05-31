import { describe, it, expect } from 'vitest'
import { transform, ESCAPE_MODES } from '@/lib/string-escape'

describe('string-escape round trips', () => {
  const samples = [
    'hello "world"',
    'a<b>c & d',
    'line1\nline2\ttab',
    '路径/with spaces?x=1&y=2',
    'emoji 😀 and café',
    'comma, "quote" inside',
  ]
  for (const mode of ESCAPE_MODES) {
    for (const s of samples) {
      it(`${mode}: round-trips ${JSON.stringify(s).slice(0, 30)}`, () => {
        const escaped = transform(s, mode, 'escape')
        const back = transform(escaped, mode, 'unescape')
        expect(back).toBe(s)
      })
    }
  }
})

describe('string-escape specifics', () => {
  it('json escapes quotes and newlines without surrounding quotes', () => {
    expect(transform('a"b\nc', 'json', 'escape')).toBe('a\\"b\\nc')
  })
  it('html escapes the five entities', () => {
    expect(transform(`<a href="x">&'`, 'html', 'escape')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;')
  })
  it('url encodes a component', () => {
    expect(transform('a b&c', 'url', 'escape')).toBe('a%20b%26c')
  })
  it('csv quotes a field with a comma', () => {
    expect(transform('a,b', 'csv', 'escape')).toBe('"a,b"')
  })
  it('csv leaves a plain field untouched', () => {
    expect(transform('plain', 'csv', 'escape')).toBe('plain')
  })
  it('unicode escapes non-ascii but keeps ascii', () => {
    expect(transform('A中', 'unicode', 'escape')).toBe('A\\u4e2d')
  })
  it('unicode handles astral via surrogate pairs', () => {
    const esc = transform('😀', 'unicode', 'escape')
    expect(esc).toBe('\\ud83d\\ude00')
    expect(transform(esc, 'unicode', 'unescape')).toBe('😀')
  })
})
