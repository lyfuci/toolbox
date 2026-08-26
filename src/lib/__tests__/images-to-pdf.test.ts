import { describe, it, expect } from 'vitest'
import {
  layoutPage,
  rgbaToRgbOnWhite,
  buildPdf,
  pdfString,
  PAGE_SIZES_PT,
  PX_TO_PT,
  reorder,
  type PdfImage,
} from '@/lib/images-to-pdf'

const ascii = (b: Uint8Array) => new TextDecoder('latin1').decode(b)

const img = (over: Partial<PdfImage> = {}): PdfImage => ({
  width: 2,
  height: 2,
  data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
  filter: 'FlateDecode',
  layout: layoutPage(2, 2, { pageSize: 'a4', orientation: 'auto', marginPt: 0 }),
  ...over,
})

describe('layoutPage', () => {
  it('fit: page grows to the image plus margins', () => {
    const l = layoutPage(800, 600, { pageSize: 'fit', orientation: 'auto', marginPt: 10 })
    expect(l.w).toBeCloseTo(800 * PX_TO_PT, 3)
    expect(l.h).toBeCloseTo(600 * PX_TO_PT, 3)
    expect(l.pageW).toBeCloseTo(800 * PX_TO_PT + 20, 3)
    expect(l.pageH).toBeCloseTo(600 * PX_TO_PT + 20, 3)
    expect(l.x).toBe(10)
    expect(l.y).toBe(10)
  })

  it('fit: orientation is ignored — the page always follows the image', () => {
    const a = layoutPage(800, 600, { pageSize: 'fit', orientation: 'portrait', marginPt: 0 })
    const b = layoutPage(800, 600, { pageSize: 'fit', orientation: 'landscape', marginPt: 0 })
    expect(a).toEqual(b)
  })

  it('auto orientation follows the image aspect', () => {
    const [short, long] = PAGE_SIZES_PT.a4
    const wide = layoutPage(1000, 500, { pageSize: 'a4', orientation: 'auto', marginPt: 0 })
    const tall = layoutPage(500, 1000, { pageSize: 'a4', orientation: 'auto', marginPt: 0 })
    expect([wide.pageW, wide.pageH]).toEqual([long, short])
    expect([tall.pageW, tall.pageH]).toEqual([short, long])
  })

  it('explicit orientation overrides the aspect', () => {
    const [short, long] = PAGE_SIZES_PT.letter
    const l = layoutPage(500, 1000, { pageSize: 'letter', orientation: 'landscape', marginPt: 0 })
    expect([l.pageW, l.pageH]).toEqual([long, short])
  })

  it('scales the image down to fit inside the margins and centres it', () => {
    const m = 36
    const l = layoutPage(2000, 1000, { pageSize: 'a4', orientation: 'landscape', marginPt: m })
    expect(l.w).toBeLessThanOrEqual(l.pageW - m * 2 + 0.001)
    expect(l.h).toBeLessThanOrEqual(l.pageH - m * 2 + 0.001)
    // aspect preserved
    expect(l.w / l.h).toBeCloseTo(2, 3)
    // centred
    expect(l.x).toBeCloseTo((l.pageW - l.w) / 2, 3)
    expect(l.y).toBeCloseTo((l.pageH - l.h) / 2, 3)
  })

  it('never upscales past the page when the margin is absurd', () => {
    const l = layoutPage(100, 100, { pageSize: 'a4', orientation: 'portrait', marginPt: 10_000 })
    expect(l.w).toBeGreaterThan(0)
    expect(l.h).toBeGreaterThan(0)
    expect(l.w).toBeLessThanOrEqual(l.pageW)
  })

  it('rejects non-positive dimensions', () => {
    expect(() => layoutPage(0, 10, { pageSize: 'a4', orientation: 'auto', marginPt: 0 })).toThrow()
    expect(() => layoutPage(10, -1, { pageSize: 'a4', orientation: 'auto', marginPt: 0 })).toThrow()
  })
})

describe('rgbaToRgbOnWhite', () => {
  it('drops the alpha channel when fully opaque', () => {
    expect(rgbaToRgbOnWhite(new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255]))).toEqual(
      new Uint8Array([10, 20, 30, 40, 50, 60]),
    )
  })

  it('composites transparency over white', () => {
    expect(rgbaToRgbOnWhite(new Uint8Array([0, 0, 0, 0]))).toEqual(new Uint8Array([255, 255, 255]))
    expect(rgbaToRgbOnWhite(new Uint8Array([0, 0, 0, 128]))).toEqual(new Uint8Array([127, 127, 127]))
  })

  it('rejects a buffer that is not a whole number of pixels', () => {
    expect(() => rgbaToRgbOnWhite(new Uint8Array([1, 2, 3]))).toThrow()
  })
})

describe('pdfString', () => {
  it('escapes parens and backslashes in ASCII strings', () => {
    expect(pdfString('a(b)c\\d')).toBe('(a\\(b\\)c\\\\d)')
  })

  it('flattens newlines and tabs', () => {
    expect(pdfString('a\nb\tc')).toBe('(a b c)')
  })

  it('switches to a UTF-16BE hex string once a character leaves ASCII', () => {
    // 照 = U+7167, 片 = U+7247
    expect(pdfString('照片')).toBe('<FEFF71677247>')
    // a = U+0061, — = U+2014, b = U+0062
    expect(pdfString('a—b')).toBe('<FEFF006120140062>')
  })

  it('keeps pure ASCII on the literal path', () => {
    expect(pdfString('scan 2026')).toBe('(scan 2026)')
  })
})

describe('buildPdf', () => {
  it('requires at least one image', () => {
    expect(() => buildPdf([])).toThrow()
  })

  it('emits a well-formed single-page document', () => {
    const bytes = buildPdf([img()])
    const s = ascii(bytes)
    expect(s.startsWith('%PDF-1.4\n')).toBe(true)
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(s).toContain('/Type /Catalog')
    expect(s).toContain('/Type /Pages /Count 1 /Kids [4 0 R]')
    expect(s).toContain('/Filter /FlateDecode')
    // 3 fixed objects + 3 per page
    expect(s).toContain('/Size 7')
  })

  it('writes one page triple per image, in order', () => {
    const bytes = buildPdf([img(), img(), img()])
    const s = ascii(bytes)
    expect(s).toContain('/Count 3 /Kids [4 0 R 7 0 R 10 0 R]')
    expect(s).toContain('/Size 13')
    expect((s.match(/\/Type \/Page\b/g) ?? []).length).toBe(3)
  })

  it('records xref offsets that point at their own object header', () => {
    const bytes = buildPdf([img(), img()])
    const s = ascii(bytes)
    const xref = s.slice(s.lastIndexOf('\nxref\n') + 1)
    const offsets = [...xref.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
    expect(offsets).toHaveLength(9)
    offsets.forEach((off, i) => {
      expect(s.startsWith(`${i + 1} 0 obj`, off)).toBe(true)
    })
    const startxref = Number(/startxref\n(\d+)/.exec(s)![1])
    expect(s.startsWith('xref\n', startxref)).toBe(true)
  })

  it('stores JPEG bytes verbatim under DCTDecode', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9])
    const bytes = buildPdf([img({ filter: 'DCTDecode', data: jpeg })])
    const s = ascii(bytes)
    expect(s).toContain('/Filter /DCTDecode')
    expect(s).toContain(`/Length ${jpeg.length} >>\nstream\n`)
    expect(s).toContain(ascii(jpeg))
  })

  it('puts optional metadata in the Info dictionary', () => {
    const s = ascii(buildPdf([img()], { title: 'My (scan)', date: new Date(Date.UTC(2026, 7, 26, 1, 2, 3)) }))
    expect(s).toContain('/Title (My \\(scan\\))')
    expect(s).toContain('/CreationDate (D:20260826010203Z)')
  })

  it('writes a non-ASCII title as a UTF-16BE hex string', () => {
    const s = ascii(buildPdf([img()], { title: '照片' }))
    expect(s).toContain('/Title <FEFF71677247>')
  })

  it('is deterministic for the same input', () => {
    const a = buildPdf([img()], { title: 't' })
    const b = buildPdf([img()], { title: 't' })
    expect(ascii(a)).toBe(ascii(b))
  })
})

describe('reorder', () => {
  it('moves an item forward and back', () => {
    const l = ['a', 'b', 'c', 'd']
    expect(reorder(l, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(reorder(l, 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('is a no-op when the index does not change', () => {
    const l = ['a', 'b']
    expect(reorder(l, 1, 1)).toEqual(l)
  })

  it('clamps out-of-range indices instead of dropping items', () => {
    const l = ['a', 'b', 'c']
    expect(reorder(l, 0, -5)).toEqual(l)
    expect(reorder(l, 0, 99)).toEqual(['b', 'c', 'a'])
    expect(reorder(l, -1, 2)).toEqual(['b', 'c', 'a'])
  })

  it('never mutates the input', () => {
    const l = ['a', 'b', 'c']
    reorder(l, 0, 2)
    expect(l).toEqual(['a', 'b', 'c'])
  })

  it('handles an empty list', () => {
    expect(reorder([], 0, 1)).toEqual([])
  })
})
