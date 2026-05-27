import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Slider } from './Slider'
import { colorRangeMask, colorRangeSelection } from '@/lib/image-editor/color-range'
import type { Point, Rect } from '@/lib/image-editor/types'

/**
 * Color Range dialog (PS: Select > Color Range).
 *
 * The user clicks the preview to drop an eyedropper sample, then tunes a
 * Fuzziness slider; a live rubylith overlay shows what the current sample +
 * fuzziness would select. OK runs the full `colorRangeSelection` pipeline and
 * hands the resulting single-polygon selection back to the caller (which owns
 * wiring it into EditorState). See `color-range.ts` for the
 * single-connected-region approximation we make here.
 *
 * `source` carries the rendered preview pixels at preview resolution; the
 * output polygon is in that same pixel space, so no extra mapping is needed
 * downstream.
 */
type Props = {
  open: boolean
  /** Rendered preview pixels at preview resolution; null while closed. */
  source: { data: Uint8ClampedArray; w: number; h: number } | null
  onApply: (sel: { path: Point[]; bbox: Rect; regionCount: number }) => void
  onCancel: () => void
}

const MAX_PREVIEW_W = 320
const DEFAULT_FUZZINESS = 40

export function ColorRangeDialog({ open, source, onApply, onCancel }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel()
      }}
    >
      {open && source && (
        <Inner
          // Hard-reset sample + fuzziness whenever a new source is opened.
          key={`${source.w}x${source.h}`}
          source={source}
          onApply={onApply}
          onCancel={onCancel}
        />
      )}
    </Dialog>
  )
}

function Inner({
  source,
  onApply,
  onCancel,
}: {
  source: { data: Uint8ClampedArray; w: number; h: number }
  onApply: (sel: { path: Point[]; bbox: Rect; regionCount: number }) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [sample, setSample] = useState<{ r: number; g: number; b: number } | null>(null)
  const [fuzziness, setFuzziness] = useState<number>(DEFAULT_FUZZINESS)
  const baseRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)

  // Display scale: fit the preview into MAX_PREVIEW_W without upscaling.
  const scale = Math.min(MAX_PREVIEW_W / source.w, 1)
  const dispW = Math.round(source.w * scale)
  const dispH = Math.round(source.h * scale)

  // Derive the live colour mask from sample + fuzziness. Memoised (not stored
  // via setState in an effect) to satisfy react-hooks/set-state-in-effect.
  const mask = useMemo(() => {
    if (!sample) return null
    return colorRangeMask(source.data, source.w, source.h, sample, fuzziness)
  }, [source, sample, fuzziness])

  // Draw the source image onto the base canvas once (per source). This effect
  // only touches the canvas ref — no setState — so it's lint-clean.
  useEffect(() => {
    const cv = baseRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    // Paint the full-resolution pixels into an offscreen, then scale-blit.
    const off = document.createElement('canvas')
    off.width = source.w
    off.height = source.h
    const offCtx = off.getContext('2d')
    if (!offCtx) return
    offCtx.putImageData(new ImageData(new Uint8ClampedArray(source.data), source.w, source.h), 0, 0)
    ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, 0, 0, cv.width, cv.height)
  }, [source])

  // Draw the rubylith overlay (semi-transparent red where selected) on top of
  // the base canvas whenever the mask changes. Ref-only effect, no setState.
  useEffect(() => {
    const cv = overlayRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, cv.width, cv.height)
    if (!mask) return
    // Build a full-res RGBA rubylith, then scale-blit to the display size.
    const { w, h } = source
    const rgba = new Uint8ClampedArray(w * h * 4)
    for (let p = 0; p < w * h; p++) {
      if (mask[p] === 0) continue
      const i = p * 4
      rgba[i] = 255
      rgba[i + 3] = 140 // ~55% red rubylith
    }
    const off = document.createElement('canvas')
    off.width = w
    off.height = h
    const offCtx = off.getContext('2d')
    if (!offCtx) return
    offCtx.putImageData(new ImageData(rgba, w, h), 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, 0, 0, cv.width, cv.height)
  }, [mask, source])

  // Map a click on the displayed canvas back to source-pixel coords and read
  // the colour there. getBoundingClientRect (not offsetX) so CSS scaling /
  // devicePixelRatio don't skew the mapping.
  const handlePick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const sx = Math.floor(((e.clientX - rect.left) / rect.width) * source.w)
    const sy = Math.floor(((e.clientY - rect.top) / rect.height) * source.h)
    if (sx < 0 || sy < 0 || sx >= source.w || sy >= source.h) return
    const i = (sy * source.w + sx) * 4
    setSample({ r: source.data[i], g: source.data[i + 1], b: source.data[i + 2] })
  }

  const swatch = sample ? `rgb(${sample.r}, ${sample.g}, ${sample.b})` : undefined

  const handleApply = () => {
    if (!sample) return
    const sel = colorRangeSelection(source.data, source.w, source.h, sample, fuzziness)
    if (sel) onApply(sel)
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t('pages.imageEditor.colorRange.title')}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {t('pages.imageEditor.colorRange.pickHint')}
        </p>
        {/* Stacked base + overlay canvases sharing one footprint. */}
        <div
          className="relative mx-auto"
          style={{ width: dispW, height: dispH }}
        >
          <canvas
            ref={baseRef}
            width={dispW}
            height={dispH}
            className="block rounded border border-input bg-muted/20"
          />
          <canvas
            ref={overlayRef}
            width={dispW}
            height={dispH}
            onClick={handlePick}
            className="absolute inset-0 cursor-crosshair rounded"
          />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            {t('pages.imageEditor.colorRange.sampledColor')}
          </span>
          <span
            className={cn(
              'inline-block h-5 w-5 rounded border border-input',
              !sample && 'bg-muted',
            )}
            style={swatch ? { backgroundColor: swatch } : undefined}
            aria-hidden
          />
          <span className="font-mono text-foreground">{swatch ?? '—'}</span>
        </div>
        <Slider
          label={t('pages.imageEditor.colorRange.fuzziness')}
          value={fuzziness}
          min={0}
          max={200}
          step={1}
          onChange={setFuzziness}
        />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          {t('pages.imageEditor.cancel')}
        </Button>
        <Button onClick={handleApply} disabled={!sample}>
          {t('pages.imageEditor.apply')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
