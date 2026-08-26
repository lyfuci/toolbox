// Build a PDF from a list of images — fully client-side, no external library.
//
// Two embedding paths, both understood by every PDF reader:
//   • DCTDecode  — the JPEG bytes are stored verbatim (small files).
//   • FlateDecode — raw 8-bit DeviceRGB samples, zlib-compressed via fflate
//                   (lossless; alpha is composited over white first, since
//                   PDF image XObjects here carry no soft mask).
//
// Everything below is pure and byte-exact so it can be unit-tested without a
// DOM; the page component does the canvas work and hands us encoded bytes.
import { zlibSync } from 'fflate'

export type PdfPageSize = 'fit' | 'a4' | 'letter'
export type PdfOrientation = 'auto' | 'portrait' | 'landscape'
export type PdfImageMode = 'jpeg' | 'lossless'

/** Page dimensions in PostScript points (1 pt = 1/72 in). */
export const PAGE_SIZES_PT = {
  a4: [595.28, 841.89],
  letter: [612, 792],
} as const satisfies Record<Exclude<PdfPageSize, 'fit'>, readonly [number, number]>

/** CSS px → pt. 96 dpi is the reference the browser itself uses for images. */
export const PX_TO_PT = 72 / 96

export type PageLayout = {
  /** Page box in pt. */
  pageW: number
  pageH: number
  /** Image placement in pt, origin bottom-left (PDF user space). */
  x: number
  y: number
  w: number
  h: number
}

export type LayoutOptions = {
  pageSize: PdfPageSize
  orientation: PdfOrientation
  /** Margin in pt, applied on all four sides. */
  marginPt: number
}

const round = (n: number) => Math.round(n * 1000) / 1000

/**
 * Place one image on a page: `fit` grows the page to the image, the fixed
 * sizes scale the image down to fit inside the margins and centre it.
 */
export function layoutPage(imgW: number, imgH: number, opts: LayoutOptions): PageLayout {
  if (!(imgW > 0) || !(imgH > 0)) throw new Error('image dimensions must be positive')
  const margin = Math.max(0, opts.marginPt)

  if (opts.pageSize === 'fit') {
    const w = imgW * PX_TO_PT
    const h = imgH * PX_TO_PT
    return {
      pageW: round(w + margin * 2),
      pageH: round(h + margin * 2),
      x: round(margin),
      y: round(margin),
      w: round(w),
      h: round(h),
    }
  }

  const [shortSide, longSide] = PAGE_SIZES_PT[opts.pageSize]
  const landscape =
    opts.orientation === 'landscape' || (opts.orientation === 'auto' && imgW > imgH)
  const pageW = landscape ? longSide : shortSide
  const pageH = landscape ? shortSide : longSide

  // A margin wider than the page would invert the box — clamp to a usable strip.
  const availW = Math.max(1, pageW - margin * 2)
  const availH = Math.max(1, pageH - margin * 2)
  const scale = Math.min(availW / imgW, availH / imgH)
  const w = imgW * scale
  const h = imgH * scale
  return {
    pageW: round(pageW),
    pageH: round(pageH),
    x: round((pageW - w) / 2),
    y: round((pageH - h) / 2),
    w: round(w),
    h: round(h),
  }
}

/** Drop alpha by compositing each pixel over white, RGBA → RGB. */
export function rgbaToRgbOnWhite(rgba: Uint8Array | Uint8ClampedArray): Uint8Array {
  if (rgba.length % 4 !== 0) throw new Error('RGBA buffer length must be a multiple of 4')
  const out = new Uint8Array((rgba.length / 4) * 3)
  for (let i = 0, o = 0; i < rgba.length; i += 4, o += 3) {
    const a = rgba[i + 3] / 255
    if (a === 1) {
      out[o] = rgba[i]
      out[o + 1] = rgba[i + 1]
      out[o + 2] = rgba[i + 2]
    } else {
      const inv = 255 * (1 - a)
      out[o] = Math.round(rgba[i] * a + inv)
      out[o + 1] = Math.round(rgba[i + 1] * a + inv)
      out[o + 2] = Math.round(rgba[i + 2] * a + inv)
    }
  }
  return out
}

/**
 * Move the item at `from` so it lands at `to`, shifting the rest along.
 * Out-of-range indices are clamped; the input array is never mutated.
 */
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  if (!next.length) return next
  const src = Math.max(0, Math.min(next.length - 1, from))
  const dst = Math.max(0, Math.min(next.length - 1, to))
  if (src === dst) return next
  const [moved] = next.splice(src, 1)
  next.splice(dst, 0, moved)
  return next
}

export type PdfImage = {
  /** Pixel dimensions of the embedded sample data. */
  width: number
  height: number
  /** JPEG file bytes (DCTDecode) or raw RGB samples (FlateDecode, compressed here). */
  data: Uint8Array
  filter: 'DCTDecode' | 'FlateDecode'
  layout: PageLayout
}

export type PdfMeta = {
  title?: string
  /** Injectable so tests produce byte-identical output. */
  date?: Date
}

const enc = new TextEncoder()

function pdfDate(d: Date): string {
  const p = (n: number, len = 2) => String(n).padStart(len, '0')
  return `D:${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
}

/**
 * Encode a PDF text string. Readers decode a literal `( … )` as PDFDocEncoding
 * (a Latin-1 superset), so anything outside ASCII — an em dash, a Chinese file
 * name — must go out as a UTF-16BE hex string with a byte-order mark instead.
 */
export function pdfString(s: string): string {
  const flat = s.replace(/[\r\n\t]/g, ' ')
  if (/^[\x20-\x7e]*$/.test(flat)) {
    return `(${flat.replace(/[\\()]/g, (c) => `\\${c}`)})`
  }
  let hex = 'FEFF'
  for (const unit of utf16Units(flat)) hex += unit.toString(16).toUpperCase().padStart(4, '0')
  return `<${hex}>`
}

function* utf16Units(s: string): Generator<number> {
  for (let i = 0; i < s.length; i++) yield s.charCodeAt(i)
}

/**
 * Serialise `images` — one per page, in order — into a single PDF file.
 * Object layout: 1 Catalog, 2 Pages, 3 Info, then (page, contents, image)
 * triples starting at 4.
 */
export function buildPdf(images: PdfImage[], meta: PdfMeta = {}): Uint8Array {
  if (!images.length) throw new Error('at least one image is required')

  const chunks: Uint8Array[] = []
  let len = 0
  const push = (part: Uint8Array | string) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part
    chunks.push(bytes)
    len += bytes.length
  }

  // offsets[objNumber] = byte offset of that object's header
  const offsets: number[] = []
  const obj = (n: number, body: string) => {
    offsets[n] = len
    push(`${n} 0 obj\n${body}\nendobj\n`)
  }

  const firstPageObj = 4
  const pageObjNum = (i: number) => firstPageObj + i * 3
  const total = 3 + images.length * 3

  push('%PDF-1.4\n')
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])) // binary marker

  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(
    2,
    `<< /Type /Pages /Count ${images.length} /Kids [${images
      .map((_, i) => `${pageObjNum(i)} 0 R`)
      .join(' ')}] >>`,
  )
  const info = [`/Producer ${pdfString('toolbox — Images to PDF')}`]
  if (meta.title) info.push(`/Title ${pdfString(meta.title)}`)
  if (meta.date) info.push(`/CreationDate ${pdfString(pdfDate(meta.date))}`)
  obj(3, `<< ${info.join(' ')} >>`)

  images.forEach((img, i) => {
    const page = pageObjNum(i)
    const contents = page + 1
    const xobj = page + 2
    const { layout: L } = img

    obj(
      page,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${L.pageW} ${L.pageH}] ` +
        `/Resources << /XObject << /Im0 ${xobj} 0 R >> /ProcSet [/PDF /ImageC] >> ` +
        `/Contents ${contents} 0 R >>`,
    )

    const stream = `q\n${L.w} 0 0 ${L.h} ${L.x} ${L.y} cm\n/Im0 Do\nQ\n`
    offsets[contents] = len
    push(`${contents} 0 obj\n<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}endstream\nendobj\n`)

    const body = img.filter === 'FlateDecode' ? zlibSync(img.data, { level: 6 }) : img.data
    offsets[xobj] = len
    push(
      `${xobj} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${img.filter} /Length ${body.length} >>\nstream\n`,
    )
    push(body)
    push('\nendstream\nendobj\n')
  })

  const xrefStart = len
  let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`
  for (let n = 1; n <= total; n++) xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
  push(xref)
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`)

  const out = new Uint8Array(len)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}
