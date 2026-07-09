import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { zipSync } from 'fflate'
import { Download, FileDown, Loader2, X, Package } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileDrop } from '@/components/FileDrop'
import { cn } from '@/lib/utils'
import {
  loadPdf,
  renderPageToBlob,
  parsePageRange,
  RASTER_EXT,
  type RasterFormat,
  type RenderedPage,
} from '@/lib/pdf'
import type { PDFDocumentProxy } from 'pdfjs-dist'

type LoadedDoc = {
  name: string
  pdf: PDFDocumentProxy
  destroy: () => Promise<void>
  pageCount: number
}

type PageResult = RenderedPage & { url: string }

type ConvertState =
  | { kind: 'idle' }
  | { kind: 'rendering'; done: number; total: number }

const FORMATS: RasterFormat[] = ['png', 'jpeg', 'webp']

// scale = DPI / 72. Presets cover screen → print resolutions.
const SCALES: { dpi: number; scale: number }[] = [
  { dpi: 72, scale: 1 },
  { dpi: 150, scale: 150 / 72 },
  { dpi: 300, scale: 300 / 72 },
  { dpi: 600, scale: 600 / 72 },
]

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '') || 'page'
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function PdfPage() {
  const { t } = useTranslation()

  const [doc, setDoc] = useState<LoadedDoc | null>(null)
  const [format, setFormat] = useState<RasterFormat>('png')
  const [quality, setQuality] = useState(0.92)
  const [scale, setScale] = useState(150 / 72)
  const [pageRange, setPageRange] = useState('')
  const [state, setState] = useState<ConvertState>({ kind: 'idle' })
  const [results, setResults] = useState<PageResult[]>([])

  // Mirror the live doc + result URLs into refs so the unmount cleanup can
  // reach the latest values without re-subscribing. Refs are synced in effects
  // (never during render).
  const docRef = useRef<LoadedDoc | null>(null)
  const resultsRef = useRef<PageResult[]>([])
  useEffect(() => {
    docRef.current = doc
  }, [doc])
  useEffect(() => {
    resultsRef.current = results
  }, [results])

  // Zero-pad page numbers in filenames to the doc's digit count (p01 vs p1).
  const pad = doc ? String(doc.pageCount).length : 1

  useEffect(() => {
    return () => {
      for (const r of resultsRef.current) URL.revokeObjectURL(r.url)
      void docRef.current?.destroy()
    }
  }, [])

  const revokeResults = () => {
    for (const r of resultsRef.current) URL.revokeObjectURL(r.url)
    setResults([])
  }

  const resetDoc = () => {
    revokeResults()
    void doc?.destroy()
    setDoc(null)
    setState({ kind: 'idle' })
  }

  const onFile = async (file: File) => {
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error(t('pages.pdf.errNotPdf'))
      return
    }
    resetDoc()
    try {
      const buf = await file.arrayBuffer()
      const { pdf, destroy } = await loadPdf(buf)
      setDoc({ name: file.name, pdf, destroy, pageCount: pdf.numPages })
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      if (name === 'PasswordException') {
        toast.error(t('pages.pdf.errEncrypted'))
      } else {
        toast.error(t('pages.pdf.errLoad', { error: err instanceof Error ? err.message : String(err) }))
      }
    }
  }

  const convert = async () => {
    if (!doc || state.kind === 'rendering') return
    const pages = parsePageRange(pageRange, doc.pageCount)
    if (pages.length === 0) {
      toast.error(t('pages.pdf.errRange'))
      return
    }
    revokeResults()
    setState({ kind: 'rendering', done: 0, total: pages.length })

    const out: PageResult[] = []
    try {
      for (let i = 0; i < pages.length; i++) {
        const rendered = await renderPageToBlob(doc.pdf, pages[i], scale, format, quality)
        out.push({ ...rendered, url: URL.createObjectURL(rendered.blob) })
        setState({ kind: 'rendering', done: i + 1, total: pages.length })
      }
      setResults(out)
      toast.success(t('pages.pdf.doneToast', { n: out.length }))
    } catch (err) {
      for (const r of out) URL.revokeObjectURL(r.url)
      toast.error(t('pages.pdf.errRender', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      setState({ kind: 'idle' })
    }
  }

  const downloadOne = (r: PageResult) => {
    const a = document.createElement('a')
    a.href = r.url
    a.download = `${baseName(doc!.name)}-p${String(r.pageNumber).padStart(pad, '0')}.${RASTER_EXT[format]}`
    a.click()
  }

  const downloadZip = async () => {
    if (!doc || !results.length) return
    const files: Record<string, Uint8Array> = {}
    for (const r of results) {
      const bytes = new Uint8Array(await r.blob.arrayBuffer())
      files[`${baseName(doc.name)}-p${String(r.pageNumber).padStart(pad, '0')}.${RASTER_EXT[format]}`] = bytes
    }
    // Images are already compressed — store, don't re-deflate.
    const zipped = zipSync(files, { level: 0 })
    const blob = new Blob([zipped as BlobPart], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${baseName(doc.name)}-images.zip`
    a.click()
    URL.revokeObjectURL(url)
  }

  const rendering = state.kind === 'rendering'
  const lossy = format !== 'png'

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.pdf.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.pdf.description')}</p>
      </header>

      {!doc ? (
        <FileDrop
          onFile={onFile}
          accept="application/pdf,.pdf"
          label={t('pages.pdf.dropLabel')}
          hint={t('pages.pdf.dropHint')}
        />
      ) : (
        <div className="space-y-6">
          {/* Loaded file bar */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card/40 px-4 py-3">
            <FileDown className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{doc.name}</p>
              <p className="text-xs text-muted-foreground">
                {t('pages.pdf.pageCount', { n: doc.pageCount })}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={resetDoc} disabled={rendering}>
              <X className="h-4 w-4" />
              {t('pages.pdf.change')}
            </Button>
          </div>

          {/* Options */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">
                {t('pages.pdf.format')}
              </Label>
              <div className="flex rounded-md border border-input bg-transparent text-sm w-fit">
                {FORMATS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    className={cn(
                      'px-3 py-1.5 uppercase transition-colors first:rounded-l-md last:rounded-r-md',
                      format === f
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">
                {t('pages.pdf.resolution')}
              </Label>
              <div className="flex rounded-md border border-input bg-transparent text-sm w-fit">
                {SCALES.map((s) => (
                  <button
                    key={s.dpi}
                    type="button"
                    onClick={() => setScale(s.scale)}
                    className={cn(
                      'px-3 py-1.5 tabular-nums transition-colors first:rounded-l-md last:rounded-r-md',
                      scale === s.scale
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {s.dpi} DPI
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="pdf-range" className="mb-1.5 block text-xs text-muted-foreground">
                {t('pages.pdf.pages')}
              </Label>
              <Input
                id="pdf-range"
                value={pageRange}
                onChange={(e) => setPageRange(e.target.value)}
                placeholder={t('pages.pdf.pagesPlaceholder')}
              />
            </div>

            {lossy && (
              <div>
                <Label htmlFor="pdf-quality" className="mb-1.5 block text-xs text-muted-foreground">
                  {t('pages.pdf.quality', { value: Math.round(quality * 100) })}
                </Label>
                <input
                  id="pdf-quality"
                  type="range"
                  min={0.4}
                  max={1}
                  step={0.01}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="mt-2 w-full accent-foreground"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={convert} disabled={rendering}>
              {rendering ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('pages.pdf.rendering', { done: state.done, total: state.total })}
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4" />
                  {t('pages.pdf.convert')}
                </>
              )}
            </Button>
            {results.length > 0 && !rendering && (
              <Button variant="outline" onClick={downloadZip}>
                <Package className="h-4 w-4" />
                {t('pages.pdf.downloadZip', { n: results.length })}
              </Button>
            )}
          </div>

          {/* Results grid */}
          {results.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {results.map((r) => (
                <div
                  key={r.pageNumber}
                  className="group overflow-hidden rounded-lg border border-border bg-card/40"
                >
                  <div className="flex aspect-[3/4] items-center justify-center bg-[repeating-conic-gradient(#0000_0_25%,#ffffff08_0_50%)] bg-[length:16px_16px] p-2">
                    <img
                      src={r.url}
                      alt={t('pages.pdf.pageAlt', { n: r.pageNumber })}
                      className="max-h-full max-w-full object-contain shadow-sm"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium">
                        {t('pages.pdf.pageLabel', { n: r.pageNumber })}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{fmtBytes(r.blob.size)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => downloadOne(r)}
                      title={t('common.download')}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
