import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Slider } from './Slider'
import type { OutputFormat } from '@/lib/image-editor/types'

/**
 * Save for Web (PS: File > Save for Web). Interactive export with format +
 * quality controls, live preview thumbnail, and an estimated file size.
 *
 * Caller passes `renderToCanvas` that paints the current editor state onto
 * a provided canvas at full resolution — the dialog re-encodes that canvas
 * to a Blob whenever format / quality change and reports the size.
 */
type Props = {
  open: boolean
  initialFormat: OutputFormat
  initialQuality: number
  /** Sized at full export resolution. Caller paints onto whatever
   *  HTMLCanvasElement we hand in (created and reused inside the dialog). */
  renderToCanvas: (canvas: HTMLCanvasElement) => void
  onSave: (args: { format: OutputFormat; quality: number; blob: Blob }) => void
  onCancel: () => void
}

export function SaveForWebDialog({
  open,
  initialFormat,
  initialQuality,
  renderToCanvas,
  onSave,
  onCancel,
}: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel()
      }}
    >
      {open && (
        <Inner
          key={`${initialFormat}-${initialQuality}`}
          initialFormat={initialFormat}
          initialQuality={initialQuality}
          renderToCanvas={renderToCanvas}
          onSave={onSave}
          onCancel={onCancel}
        />
      )}
    </Dialog>
  )
}

const FORMATS: OutputFormat[] = ['png', 'jpeg', 'webp']

function Inner({
  initialFormat,
  initialQuality,
  renderToCanvas,
  onSave,
  onCancel,
}: {
  initialFormat: OutputFormat
  initialQuality: number
  renderToCanvas: (canvas: HTMLCanvasElement) => void
  onSave: (args: { format: OutputFormat; quality: number; blob: Blob }) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [format, setFormat] = useState<OutputFormat>(initialFormat)
  const [quality, setQuality] = useState<number>(initialQuality)
  const [blobSize, setBlobSize] = useState<number | null>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const fullRef = useRef<HTMLCanvasElement | null>(null)
  const lastBlob = useRef<Blob | null>(null)

  // Render full-res canvas once on mount, paint a downscaled preview.
  useEffect(() => {
    const full = document.createElement('canvas')
    renderToCanvas(full)
    fullRef.current = full
    if (previewRef.current) {
      const max = 360
      const ratio = Math.min(max / full.width, max / full.height, 1)
      previewRef.current.width = Math.round(full.width * ratio)
      previewRef.current.height = Math.round(full.height * ratio)
      const ctx = previewRef.current.getContext('2d')
      if (ctx) ctx.drawImage(full, 0, 0, previewRef.current.width, previewRef.current.height)
    }
  }, [renderToCanvas])

  // Re-encode on format / quality change to compute size + cache blob.
  useEffect(() => {
    if (!fullRef.current) return
    const mime = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp'
    const q = format === 'png' ? undefined : quality / 100
    let cancelled = false
    fullRef.current.toBlob(
      (b) => {
        if (cancelled) return
        lastBlob.current = b
        setBlobSize(b?.size ?? null)
      },
      mime,
      q,
    )
    return () => {
      cancelled = true
    }
  }, [format, quality])

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t('pages.imageEditor.saveForWeb.title')}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <canvas
          ref={previewRef}
          className="mx-auto block rounded border border-input bg-muted/20"
        />
        <div className="flex items-center gap-2">
          <Label className="w-20 text-xs text-muted-foreground">
            {t('pages.imageEditor.saveForWeb.format')}
          </Label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as OutputFormat)}
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        {format !== 'png' && (
          <Slider
            label={t('pages.imageEditor.saveForWeb.quality')}
            value={quality}
            min={1}
            max={100}
            unit="%"
            onChange={setQuality}
          />
        )}
        <div className="text-xs text-muted-foreground">
          {blobSize !== null
            ? t('pages.imageEditor.saveForWeb.size', { kb: (blobSize / 1024).toFixed(1) })
            : t('pages.imageEditor.saveForWeb.computing')}
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          {t('pages.imageEditor.cancel')}
        </Button>
        <Button
          onClick={() => {
            if (lastBlob.current) {
              onSave({ format, quality, blob: lastBlob.current })
            }
          }}
          disabled={blobSize === null}
        >
          {t('pages.imageEditor.saveForWeb.save')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
