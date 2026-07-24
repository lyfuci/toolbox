import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { zipSync } from 'fflate'
import { Download, Package, Loader2, X, ImageOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileDrop } from '@/components/FileDrop'
import { cn } from '@/lib/utils'
import {
  resolveOutput,
  fitDimensions,
  searchQualityForSize,
  pctChange,
  fmtBytes,
  type OutFormat,
} from '@/lib/image-compress'

type Mode = 'quality' | 'target'
type Source = { id: string; file: File }
type Result =
  | { status: 'done'; url: string; blob: Blob; outName: string; outW: number; outH: number; quality?: number }
  | { status: 'error'; error: string }

const FORMATS: OutFormat[] = ['original', 'jpeg', 'webp', 'png']
const FORMAT_LABEL: Record<OutFormat, string> = { original: '', jpeg: 'JPEG', webp: 'WebP', png: 'PNG' }

let idCounter = 0
const nextId = () => `img_${++idCounter}`
const baseName = (name: string) => name.replace(/\.[^./]+$/, '') || 'image'

function encode(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality))
}

export function ImageCompressPage() {
  const { t } = useTranslation()
  const [sources, setSources] = useState<Source[]>([])
  const [results, setResults] = useState<Record<string, Result>>({})
  const [mode, setMode] = useState<Mode>('quality')
  const [quality, setQuality] = useState(80)
  const [targetKB, setTargetKB] = useState(200)
  const [format, setFormat] = useState<OutFormat>('original')
  const [maxEdge, setMaxEdge] = useState('') // '' = no resize
  const [busy, setBusy] = useState(false)

  const runRef = useRef(0)
  const resultsRef = useRef(results)
  useEffect(() => {
    resultsRef.current = results
  }, [results])
  useEffect(
    () => () => {
      for (const r of Object.values(resultsRef.current)) if (r.status === 'done') URL.revokeObjectURL(r.url)
    },
    [],
  )

  const onFiles = (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'))
    const skipped = files.length - imgs.length
    if (skipped > 0) toast.error(t('pages.imageCompress.errNotImage', { n: skipped }))
    if (imgs.length) setSources((prev) => [...prev, ...imgs.map((f) => ({ id: nextId(), file: f }))])
  }

  const removeItem = (id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id))
    setResults((prev) => {
      const r = prev[id]
      if (r?.status === 'done') URL.revokeObjectURL(r.url)
      const rest = { ...prev }
      delete rest[id]
      return rest
    })
  }
  const clearAll = () => {
    for (const r of Object.values(resultsRef.current)) if (r.status === 'done') URL.revokeObjectURL(r.url)
    setSources([])
    setResults({})
  }

  const putResult = (id: string, next: Result) => {
    setResults((prev) => {
      const old = prev[id]
      if (old?.status === 'done') URL.revokeObjectURL(old.url)
      return { ...prev, [id]: next }
    })
  }

  const process = useCallback(async () => {
    const run = ++runRef.current
    if (!sources.length) {
      setBusy(false)
      return
    }
    setBusy(true)
    const maxE = maxEdge.trim() ? Math.max(1, Math.floor(Number(maxEdge))) : null
    const targetBytes = Math.max(1, Math.round(targetKB * 1024))
    for (const { id, file } of sources) {
      if (runRef.current !== run) return
      try {
        const bmp = await createImageBitmap(file)
        const { width, height } = fitDimensions(bmp.width, bmp.height, maxE)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('canvas 2d context unavailable')
        const { mime, ext, lossy } = resolveOutput(file.type, format)
        // JPEG has no alpha — paint white so transparency doesn't turn black.
        if (mime === 'image/jpeg') {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, width, height)
        }
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(bmp, 0, 0, width, height)
        bmp.close?.()

        let blob: Blob | null
        let usedQ: number | undefined
        if (lossy && mode === 'target') {
          const q = await searchQualityForSize(
            async (qq) => (await encode(canvas, mime, qq / 100))?.size ?? Number.POSITIVE_INFINITY,
            targetBytes,
          )
          usedQ = q
          blob = await encode(canvas, mime, q / 100)
        } else if (lossy) {
          usedQ = quality
          blob = await encode(canvas, mime, quality / 100)
        } else {
          blob = await encode(canvas, mime) // PNG — lossless, quality ignored
        }
        canvas.width = 0
        canvas.height = 0
        if (!blob) throw new Error('canvas.toBlob returned null')
        if (runRef.current !== run) return
        putResult(id, {
          status: 'done',
          url: URL.createObjectURL(blob),
          blob,
          outName: `${baseName(file.name)}.${ext}`,
          outW: width,
          outH: height,
          quality: usedQ,
        })
      } catch (e) {
        if (runRef.current !== run) return
        putResult(id, { status: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    }
    if (runRef.current === run) setBusy(false)
  }, [sources, mode, quality, targetKB, format, maxEdge])

  // Re-process (debounced) whenever the file set or any setting changes. A new
  // run bumps runRef at its start, so any still-in-flight run supersedes itself.
  useEffect(() => {
    const timer = setTimeout(() => void process(), 300)
    return () => clearTimeout(timer)
  }, [process])

  const summary = useMemo(() => {
    let before = 0
    let after = 0
    let done = 0
    for (const s of sources) {
      const r = results[s.id]
      if (r?.status === 'done') {
        before += s.file.size
        after += r.blob.size
        done += 1
      }
    }
    return { before, after, done }
  }, [sources, results])

  const downloadOne = (r: Extract<Result, { status: 'done' }>) => {
    const a = document.createElement('a')
    a.href = r.url
    a.download = r.outName
    a.click()
  }

  const downloadZip = async () => {
    const files: Record<string, Uint8Array> = {}
    const used = new Set<string>()
    for (const s of sources) {
      const r = results[s.id]
      if (r?.status !== 'done') continue
      let name = r.outName
      let i = 1
      while (used.has(name)) name = `${baseName(r.outName)}-${i++}.${r.outName.split('.').pop()}`
      used.add(name)
      files[name] = new Uint8Array(await r.blob.arrayBuffer())
    }
    if (!Object.keys(files).length) return
    const zipped = zipSync(files, { level: 0 }) // already compressed
    const url = URL.createObjectURL(new Blob([zipped as BlobPart], { type: 'application/zip' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'compressed-images.zip'
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasContent = sources.length > 0

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.image-compress.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.imageCompress.description')}</p>
      </header>

      {!hasContent ? (
        <FileDrop
          multiple
          onFiles={onFiles}
          accept="image/*"
          label={t('pages.imageCompress.dropLabel')}
          hint={t('pages.imageCompress.dropHint')}
        />
      ) : (
        <div className="space-y-6">
          {/* Options */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">{t('pages.imageCompress.mode')}</Label>
              <div className="flex w-fit rounded-md border border-input bg-transparent text-sm">
                {(['quality', 'target'] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      'px-3 py-1.5 transition-colors first:rounded-l-md last:rounded-r-md',
                      mode === m ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t(`pages.imageCompress.mode_${m}`)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">{t('pages.imageCompress.format')}</Label>
              <div className="flex w-fit rounded-md border border-input bg-transparent text-sm">
                {FORMATS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    className={cn(
                      'px-3 py-1.5 transition-colors first:rounded-l-md last:rounded-r-md',
                      format === f ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {f === 'original' ? t('pages.imageCompress.formatOriginal') : FORMAT_LABEL[f]}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'quality' ? (
              <div>
                <Label htmlFor="ic-quality" className="mb-1.5 block text-xs text-muted-foreground">
                  {t('pages.imageCompress.quality', { value: quality })}
                </Label>
                <input
                  id="ic-quality"
                  type="range"
                  min={30}
                  max={100}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="mt-2 w-full accent-foreground"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">{t('pages.imageCompress.qualityHint')}</p>
              </div>
            ) : (
              <div>
                <Label htmlFor="ic-target" className="mb-1.5 block text-xs text-muted-foreground">
                  {t('pages.imageCompress.targetSize')}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="ic-target"
                    type="number"
                    min={1}
                    value={targetKB}
                    onChange={(e) => setTargetKB(Math.max(1, Number(e.target.value)))}
                    className="w-28"
                  />
                  <span className="text-xs text-muted-foreground">KB</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{t('pages.imageCompress.targetHint')}</p>
              </div>
            )}

            <div>
              <Label htmlFor="ic-maxedge" className="mb-1.5 block text-xs text-muted-foreground">
                {t('pages.imageCompress.maxEdge')}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="ic-maxedge"
                  type="number"
                  min={1}
                  value={maxEdge}
                  onChange={(e) => setMaxEdge(e.target.value)}
                  placeholder={t('pages.imageCompress.maxEdgePlaceholder')}
                  className="w-28"
                />
                <span className="text-xs text-muted-foreground">px</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{t('pages.imageCompress.maxEdgeHint')}</p>
            </div>
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer text-sm text-primary hover:underline">
              {t('pages.imageCompress.addMore')}
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) onFiles([...e.target.files])
                  e.target.value = ''
                }}
              />
            </label>
            <Button variant="ghost" size="sm" onClick={clearAll}>
              {t('common.clear')}
            </Button>
            {busy && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('pages.imageCompress.processing')}
              </span>
            )}
            {summary.done > 0 && (
              <span className="text-xs text-muted-foreground">
                {t('pages.imageCompress.summary', {
                  n: summary.done,
                  before: fmtBytes(summary.before),
                  after: fmtBytes(summary.after),
                  pct: pctChange(summary.before, summary.after),
                })}
              </span>
            )}
            {summary.done > 0 && (
              <Button variant="outline" size="sm" className="ml-auto" onClick={downloadZip}>
                <Package className="mr-1 h-4 w-4" />
                {t('pages.imageCompress.downloadZip', { n: summary.done })}
              </Button>
            )}
          </div>

          {/* Results */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {sources.map((s) => {
              const r = results[s.id]
              const smaller = r?.status === 'done' && r.blob.size < s.file.size
              return (
                <div key={s.id} className="group relative overflow-hidden rounded-lg border border-border bg-card/40">
                  <button
                    type="button"
                    onClick={() => removeItem(s.id)}
                    title={t('common.clear')}
                    className="absolute right-1 top-1 z-10 rounded bg-background/70 p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div className="flex aspect-[4/3] items-center justify-center bg-[repeating-conic-gradient(#0000_0_25%,#ffffff08_0_50%)] bg-[length:16px_16px] p-2">
                    {r?.status === 'done' ? (
                      <img src={r.url} alt={s.file.name} className="max-h-full max-w-full object-contain shadow-sm" />
                    ) : r?.status === 'error' ? (
                      <ImageOff className="h-8 w-8 text-destructive/70" />
                    ) : (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <div className="px-3 py-2">
                    <p className="truncate text-xs font-medium" title={s.file.name}>
                      {r?.status === 'done' ? r.outName : s.file.name}
                    </p>
                    {r?.status === 'done' ? (
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="text-[11px] text-muted-foreground">
                          {fmtBytes(s.file.size)} → {fmtBytes(r.blob.size)}
                          <span className={cn('ml-1 font-medium', smaller ? 'text-emerald-500' : 'text-amber-500')}>
                            {pctChange(s.file.size, r.blob.size)}%
                          </span>
                        </p>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          onClick={() => downloadOne(r)}
                          title={t('common.download')}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : r?.status === 'error' ? (
                      <p className="mt-0.5 truncate text-[11px] text-destructive" title={r.error}>
                        {t('pages.imageCompress.errDecode')}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{fmtBytes(s.file.size)}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
