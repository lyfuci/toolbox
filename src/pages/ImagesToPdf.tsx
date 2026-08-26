import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownAZ,
  ArrowLeft,
  ArrowRight,
  Clock3,
  FileDown,
  GripVertical,
  Loader2,
  Shuffle,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileDrop } from '@/components/FileDrop'
import { cn } from '@/lib/utils'
import {
  buildPdf,
  layoutPage,
  rgbaToRgbOnWhite,
  type PdfImage,
  type PdfImageMode,
  type PdfOrientation,
  type PdfPageSize,
  reorder,
} from '@/lib/images-to-pdf'

type Item = { id: string; file: File; url: string }

const PAGE_SIZES: PdfPageSize[] = ['fit', 'a4', 'letter']
const ORIENTATIONS: PdfOrientation[] = ['auto', 'portrait', 'landscape']
const MODES: PdfImageMode[] = ['jpeg', 'lossless']

let idCounter = 0
const nextId = () => `pdfimg_${++idCounter}`
const baseName = (name: string) => name.replace(/\.[^./]+$/, '') || 'images'

const fmtBytes = (n: number) => {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

function encodeCanvas(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality))
}

export function ImagesToPdfPage() {
  const { t } = useTranslation()
  const [items, setItems] = useState<Item[]>([])
  const [pageSize, setPageSize] = useState<PdfPageSize>('fit')
  const [orientation, setOrientation] = useState<PdfOrientation>('auto')
  const [mode, setMode] = useState<PdfImageMode>('jpeg')
  const [quality, setQuality] = useState(85)
  const [marginMm, setMarginMm] = useState('0')
  const [fileName, setFileName] = useState('images')
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  // Revoke every preview URL on unmount without re-running on each edit.
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  }, [items])
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url)), [])

  const onFiles = useCallback(
    (files: File[]) => {
      const imgs = files.filter((f) => f.type.startsWith('image/'))
      const skipped = files.length - imgs.length
      if (skipped > 0) toast.error(t('pages.imagesToPdf.errNotImage', { n: skipped }))
      if (!imgs.length) return
      const added = imgs.map((f) => ({ id: nextId(), file: f, url: URL.createObjectURL(f) }))
      setItems((prev) => (prev.length ? [...prev, ...added] : added))
      if (!itemsRef.current.length) setFileName(baseName(imgs[0].name))
    },
    [t],
  )

  const removeItem = (id: string) =>
    setItems((prev) => {
      const hit = prev.find((i) => i.id === id)
      if (hit) URL.revokeObjectURL(hit.url)
      return prev.filter((i) => i.id !== id)
    })

  const clearAll = () => {
    itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url))
    setItems([])
  }

  /** Move `id` so it lands at index `to`, keeping the rest of the order. */
  const moveTo = (id: string, to: number) =>
    setItems((prev) => {
      const from = prev.findIndex((i) => i.id === id)
      return from < 0 ? prev : reorder(prev, from, to)
    })

  const nudge = (id: string, delta: number) =>
    setItems((prev) => {
      const from = prev.findIndex((i) => i.id === id)
      return from < 0 ? prev : reorder(prev, from, from + delta)
    })

  const sortBy = (key: 'name' | 'time' | 'reverse') =>
    setItems((prev) => {
      if (key === 'reverse') return [...prev].reverse()
      const next = [...prev]
      next.sort(
        key === 'name'
          ? (a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: 'base' })
          : (a, b) => a.file.lastModified - b.file.lastModified,
      )
      return next
    })

  const totalBytes = useMemo(() => items.reduce((n, i) => n + i.file.size, 0), [items])

  const generate = async () => {
    if (!items.length || busy) return
    const marginPt = Math.max(0, (Number(marginMm) || 0) * (72 / 25.4))
    setBusy({ done: 0, total: items.length })
    try {
      const pages: PdfImage[] = []
      for (const [idx, item] of items.entries()) {
        // Honour EXIF orientation so phone photos aren't sideways in the PDF.
        const bmp = await createImageBitmap(item.file, { imageOrientation: 'from-image' })
        const canvas = document.createElement('canvas')
        canvas.width = bmp.width
        canvas.height = bmp.height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('canvas 2d context unavailable')
        if (mode === 'jpeg') {
          // JPEG has no alpha — paint white so transparency doesn't turn black.
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }
        ctx.drawImage(bmp, 0, 0)
        bmp.close?.()

        const layout = layoutPage(canvas.width, canvas.height, { pageSize, orientation, marginPt })
        if (mode === 'jpeg') {
          const blob = await encodeCanvas(canvas, 'image/jpeg', quality / 100)
          if (!blob) throw new Error('canvas.toBlob returned null')
          pages.push({
            width: canvas.width,
            height: canvas.height,
            data: new Uint8Array(await blob.arrayBuffer()),
            filter: 'DCTDecode',
            layout,
          })
        } else {
          const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
          pages.push({
            width: canvas.width,
            height: canvas.height,
            data: rgbaToRgbOnWhite(data),
            filter: 'FlateDecode',
            layout,
          })
        }
        canvas.width = 0
        canvas.height = 0
        setBusy({ done: idx + 1, total: items.length })
      }

      const bytes = buildPdf(pages, { title: fileName.trim() || 'images', date: new Date() })
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${fileName.trim() || 'images'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t('pages.imagesToPdf.doneToast', { n: pages.length, size: fmtBytes(bytes.length) }))
    } catch (e) {
      toast.error(t('pages.imagesToPdf.errBuild', { error: e instanceof Error ? e.message : String(e) }))
    } finally {
      setBusy(null)
    }
  }

  const segmented = <T extends string>(
    value: T,
    options: readonly T[],
    onChange: (v: T) => void,
    label: (v: T) => string,
  ) => (
    <div className="flex w-fit rounded-md border border-input bg-transparent text-sm">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            'px-3 py-1.5 transition-colors first:rounded-l-md last:rounded-r-md',
            value === o ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label(o)}
        </button>
      ))}
    </div>
  )

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.images-to-pdf.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.imagesToPdf.description')}</p>
      </header>

      {!items.length ? (
        <FileDrop
          multiple
          onFiles={onFiles}
          accept="image/*"
          label={t('pages.imagesToPdf.dropLabel')}
          hint={t('pages.imagesToPdf.dropHint')}
        />
      ) : (
        <div className="space-y-6">
          {/* Options */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">{t('pages.imagesToPdf.pageSize')}</Label>
              {segmented(pageSize, PAGE_SIZES, setPageSize, (v) => t(`pages.imagesToPdf.pageSize_${v}`))}
              <p className="mt-1 text-[11px] text-muted-foreground">{t('pages.imagesToPdf.pageSizeHint')}</p>
            </div>

            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">
                {t('pages.imagesToPdf.orientation')}
              </Label>
              {segmented(orientation, ORIENTATIONS, setOrientation, (v) =>
                t(`pages.imagesToPdf.orientation_${v}`),
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {pageSize === 'fit' ? t('pages.imagesToPdf.orientationIgnored') : ' '}
              </p>
            </div>

            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">{t('pages.imagesToPdf.mode')}</Label>
              {segmented(mode, MODES, setMode, (v) => t(`pages.imagesToPdf.mode_${v}`))}
              <p className="mt-1 text-[11px] text-muted-foreground">{t(`pages.imagesToPdf.modeHint_${mode}`)}</p>
            </div>

            {mode === 'jpeg' ? (
              <div>
                <Label htmlFor="i2p-quality" className="mb-1.5 block text-xs text-muted-foreground">
                  {t('pages.imagesToPdf.quality', { value: quality })}
                </Label>
                <input
                  id="i2p-quality"
                  type="range"
                  min={40}
                  max={100}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="mt-2 w-full accent-foreground"
                />
              </div>
            ) : (
              <div />
            )}

            <div>
              <Label htmlFor="i2p-margin" className="mb-1.5 block text-xs text-muted-foreground">
                {t('pages.imagesToPdf.margin')}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="i2p-margin"
                  type="number"
                  min={0}
                  value={marginMm}
                  onChange={(e) => setMarginMm(e.target.value)}
                  className="w-28"
                />
                <span className="text-xs text-muted-foreground">mm</span>
              </div>
            </div>

            <div>
              <Label htmlFor="i2p-name" className="mb-1.5 block text-xs text-muted-foreground">
                {t('pages.imagesToPdf.fileName')}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="i2p-name"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="w-56"
                />
                <span className="text-xs text-muted-foreground">.pdf</span>
              </div>
            </div>
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer text-sm text-primary hover:underline">
              {t('pages.imagesToPdf.addMore')}
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
            <Button variant="ghost" size="sm" onClick={() => sortBy('name')}>
              <ArrowDownAZ className="mr-1 h-4 w-4" />
              {t('pages.imagesToPdf.sortName')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => sortBy('time')}>
              <Clock3 className="mr-1 h-4 w-4" />
              {t('pages.imagesToPdf.sortTime')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => sortBy('reverse')}>
              <Shuffle className="mr-1 h-4 w-4" />
              {t('pages.imagesToPdf.reverse')}
            </Button>
            <Button variant="ghost" size="sm" onClick={clearAll}>
              {t('common.clear')}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t('pages.imagesToPdf.summary', { n: items.length, size: fmtBytes(totalBytes) })}
            </span>
            <Button size="sm" className="ml-auto" onClick={generate} disabled={!!busy}>
              {busy ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  {t('pages.imagesToPdf.building', { done: busy.done, total: busy.total })}
                </>
              ) : (
                <>
                  <FileDown className="mr-1 h-4 w-4" />
                  {t('pages.imagesToPdf.generate', { n: items.length })}
                </>
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">{t('pages.imagesToPdf.reorderHint')}</p>

          {/* Pages, in output order — drag a card onto another to reorder. */}
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {items.map((item, index) => (
              <li
                key={item.id}
                draggable
                onDragStart={(e) => {
                  setDragId(item.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => {
                  if (dragId && dragId !== item.id) e.preventDefault()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragId && dragId !== item.id) moveTo(dragId, index)
                  setDragId(null)
                }}
                className={cn(
                  'group relative overflow-hidden rounded-lg border border-border bg-card/40 transition-opacity',
                  dragId === item.id && 'opacity-40',
                )}
              >
                <span className="absolute left-1 top-1 z-10 rounded bg-background/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
                  {index + 1}
                </span>
                <span className="absolute left-1/2 top-1 z-10 -translate-x-1/2 cursor-grab rounded bg-background/70 p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                  <GripVertical className="h-3.5 w-3.5" />
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  title={t('common.clear')}
                  className="absolute right-1 top-1 z-10 rounded bg-background/70 p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>

                <div className="flex aspect-[4/3] items-center justify-center bg-[repeating-conic-gradient(#0000_0_25%,#ffffff08_0_50%)] bg-[length:16px_16px] p-2">
                  <img
                    src={item.url}
                    alt={item.file.name}
                    draggable={false}
                    className="max-h-full max-w-full object-contain shadow-sm"
                  />
                </div>

                <div className="flex items-center gap-1 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium" title={item.file.name}>
                      {item.file.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{fmtBytes(item.file.size)}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    disabled={index === 0}
                    onClick={() => nudge(item.id, -1)}
                    title={t('pages.imagesToPdf.moveEarlier')}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    disabled={index === items.length - 1}
                    onClick={() => nudge(item.id, 1)}
                    title={t('pages.imagesToPdf.moveLater')}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
