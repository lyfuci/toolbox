// PDF rendering helpers built on pdf.js (pdfjs-dist), fully client-side.
//
// Runtime assets (worker + cmaps / standard fonts / wasm) are served from
// `public/pdfjs/` rather than a CDN — the site is COOP/COEP cross-origin-
// isolated and makes no external calls, so both constraints forbid the pdf.js
// default CDN URLs. When bumping pdfjs-dist, re-copy them:
//   cp -r node_modules/pdfjs-dist/{cmaps,standard_fonts,wasm} public/pdfjs/
//   cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdfjs/pdf.worker.min.js
//
// The worker is deliberately copied to a `.js` extension (not the source
// `.mjs`): pdf.js loads it as a module worker regardless of extension, and our
// nginx serves `.js` as `application/javascript` while `.mjs` falls through to
// `application/octet-stream`, which browsers refuse to import as a module.
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'

export { parsePageRange } from './pdf-range'

// Local, self-contained asset roots (trailing slash required by pdf.js).
const ASSET_BASE = `${import.meta.env.BASE_URL}pdfjs/`

pdfjsLib.GlobalWorkerOptions.workerSrc = `${ASSET_BASE}pdf.worker.min.js`
const DOC_ASSETS = {
  cMapUrl: `${ASSET_BASE}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
  wasmUrl: `${ASSET_BASE}wasm/`,
} as const

export type RasterFormat = 'png' | 'jpeg' | 'webp'

export const RASTER_MIME: Record<RasterFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

export const RASTER_EXT: Record<RasterFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
}

// Browsers cap canvas pixels; exceeding it yields a blank bitmap. Chrome allows
// ~16384 per side and a total-area limit — stay comfortably under both.
const MAX_CANVAS_SIDE = 12000
const MAX_CANVAS_AREA = 96_000_000

export type LoadedPdf = {
  pdf: PDFDocumentProxy
  /** Tears down the worker transport. Call when done with the document. */
  destroy: () => Promise<void>
}

/** Load a PDF from bytes. Caller must `destroy()` when done. */
export async function loadPdf(data: ArrayBuffer): Promise<LoadedPdf> {
  // We never enable scripting/XFA (both off by default in pdf.js), so
  // JavaScript embedded in an untrusted PDF is never executed — we only
  // rasterize page content.
  const task = pdfjsLib.getDocument({
    data: new Uint8Array(data),
    ...DOC_ASSETS,
  })
  const pdf = await task.promise
  return { pdf, destroy: () => task.destroy() }
}

export type RenderedPage = {
  pageNumber: number
  width: number
  height: number
  blob: Blob
}

/**
 * Render one page to a raster Blob at the given scale. Renders onto a throwaway
 * canvas that is released immediately after `toBlob`, so a large multi-page
 * export never holds more than one full-res bitmap at a time.
 *
 * `scale` maps 1 = 72 DPI (PDF user space). For JPEG/WebP (no alpha) the canvas
 * is painted white first, otherwise transparent regions come out black.
 */
export async function renderPageToBlob(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  scale: number,
  format: RasterFormat,
  quality: number,
): Promise<RenderedPage> {
  const page = await pdf.getPage(pageNumber)
  try {
    // Clamp the effective scale so the canvas stays within browser limits.
    const base = page.getViewport({ scale: 1 })
    let s = scale
    const cap = Math.min(
      MAX_CANVAS_SIDE / base.width,
      MAX_CANVAS_SIDE / base.height,
      Math.sqrt(MAX_CANVAS_AREA / (base.width * base.height)),
    )
    if (s > cap) s = cap

    const viewport = page.getViewport({ scale: s })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(viewport.width))
    canvas.height = Math.max(1, Math.ceil(viewport.height))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context unavailable')

    if (format !== 'png') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    await page.render({ canvas, canvasContext: ctx, viewport }).promise

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, RASTER_MIME[format], format === 'png' ? undefined : quality),
    )
    // Release the bitmap eagerly (some browsers keep large canvases around).
    canvas.width = 0
    canvas.height = 0
    if (!blob) throw new Error('canvas.toBlob returned null')

    return { pageNumber, width: viewport.width, height: viewport.height, blob }
  } finally {
    page.cleanup()
  }
}

