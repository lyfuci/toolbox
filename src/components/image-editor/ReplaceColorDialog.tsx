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
import {
  applyReplaceColor,
  DEFAULT_REPLACE_COLOR,
  type ReplaceColorParams,
} from '@/lib/image-editor/adj-replace-color'

/**
 * Replace Color dialog (PS: Image > Adjustments > Replace Color).
 *
 * Mirrors the layout / lifecycle of `ColorRangeDialog`: the user clicks the
 * preview to drop an eyedropper sample (which becomes `params.target`), then
 * tunes Fuzziness + HSL shift sliders. A live before/after preview shows the
 * adjustment applied at the current params, plus a faint rubylith overlay so
 * the user can see exactly which pixels the fuzziness/target are catching
 * (independent of the visual change the HSL shifts produce).
 *
 * `source` is a pre-rendered preview buffer at preview resolution — the same
 * convention used by `ColorRangeDialog`. The dialog returns `params` only;
 * actually mutating the document buffer is the caller's job at full
 * resolution (the wiring step does that hookup).
 *
 * React-19 gotcha: every derived quantity (mask, preview pixels) lives in a
 * `useMemo`, never in a `useState` written from a `useEffect`. The canvases
 * are painted from refs in ref-only effects, which is the one pattern the
 * react-hooks lint rule still tolerates.
 */
type Props = {
  open: boolean
  /** Composite preview buffer (preview resolution); null while closed. */
  source: { data: Uint8ClampedArray; w: number; h: number } | null
  onApply: (params: ReplaceColorParams) => void
  onCancel: () => void
}

const MAX_PREVIEW_W = 320

export function ReplaceColorDialog({ open, source, onApply, onCancel }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel()
      }}
    >
      {open && source && (
        <Inner
          // Hard-reset sample + sliders whenever a new source is opened.
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
  onApply: (params: ReplaceColorParams) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [sample, setSample] = useState<{ r: number; g: number; b: number } | null>(null)
  const [fuzziness, setFuzziness] = useState<number>(DEFAULT_REPLACE_COLOR.fuzziness)
  const [hueShift, setHueShift] = useState<number>(DEFAULT_REPLACE_COLOR.hueShift)
  const [satShift, setSatShift] = useState<number>(DEFAULT_REPLACE_COLOR.saturationShift)
  const [lightShift, setLightShift] = useState<number>(DEFAULT_REPLACE_COLOR.lightnessShift)
  const baseRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)

  // Display scale: fit the preview into MAX_PREVIEW_W without upscaling.
  const scale = Math.min(MAX_PREVIEW_W / source.w, 1)
  const dispW = Math.round(source.w * scale)
  const dispH = Math.round(source.h * scale)

  // The exact params the algorithm will run with — memoised so the preview
  // and the OK callback agree on what's being shown.
  const params: ReplaceColorParams = useMemo(
    () => ({
      kind: 'replaceColor',
      target: sample ?? DEFAULT_REPLACE_COLOR.target,
      fuzziness,
      hueShift,
      saturationShift: satShift,
      lightnessShift: lightShift,
    }),
    [sample, fuzziness, hueShift, satShift, lightShift],
  )

  // Apply the adjustment to a fresh copy of the source for the live preview.
  // useMemo (not setState-in-effect) keeps this lint-clean per React 19 rules.
  // When no sample is picked yet we fall through to a passthrough buffer so
  // the user always sees the underlying image, not a blank canvas.
  const previewBuf = useMemo(() => {
    const buf = new Uint8ClampedArray(source.data)
    if (sample) applyReplaceColor(buf, params)
    return buf
  }, [source, sample, params])

  // Per-pixel match weight, scaled to a byte for the rubylith overlay. Lets
  // the user see what fuzziness/target is selecting independently of how
  // visible the HSL shift happens to be (e.g. before they move any slider).
  const matchMask = useMemo(() => {
    if (!sample) return null
    const n = source.w * source.h
    const out = new Uint8Array(n)
    const fuzz = fuzziness
    const fuzzSq = fuzz * fuzz
    for (let p = 0; p < n; p++) {
      const i = p * 4
      if (source.data[i + 3] === 0) continue
      const dr = source.data[i] - sample.r
      const dg = source.data[i + 1] - sample.g
      const db = source.data[i + 2] - sample.b
      const distSq = dr * dr + dg * dg + db * db
      if (fuzz <= 0) {
        if (distSq === 0) out[p] = 255
        continue
      }
      if (distSq >= fuzzSq) continue
      const w = 1 - Math.sqrt(distSq) / fuzz
      out[p] = Math.round(w * 255)
    }
    return out
  }, [source, sample, fuzziness])

  // Paint the live "after" preview onto the base canvas. Ref-only effect.
  useEffect(() => {
    const cv = baseRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const off = document.createElement('canvas')
    off.width = source.w
    off.height = source.h
    const offCtx = off.getContext('2d')
    if (!offCtx) return
    offCtx.putImageData(
      new ImageData(new Uint8ClampedArray(previewBuf), source.w, source.h),
      0,
      0,
    )
    ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, 0, 0, cv.width, cv.height)
  }, [previewBuf, source])

  // Paint the rubylith overlay (translucent red proportional to match weight)
  // so the user can see the fuzziness footprint at a glance. Ref-only effect.
  useEffect(() => {
    const cv = overlayRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, cv.width, cv.height)
    if (!matchMask) return
    const { w, h } = source
    const rgba = new Uint8ClampedArray(w * h * 4)
    for (let p = 0; p < w * h; p++) {
      const m = matchMask[p]
      if (m === 0) continue
      const i = p * 4
      rgba[i] = 255
      // Cap alpha so the overlay doesn't drown out the underlying preview.
      rgba[i + 3] = Math.round((m / 255) * 110)
    }
    const off = document.createElement('canvas')
    off.width = w
    off.height = h
    const offCtx = off.getContext('2d')
    if (!offCtx) return
    offCtx.putImageData(new ImageData(rgba, w, h), 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, 0, 0, cv.width, cv.height)
  }, [matchMask, source])

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
    onApply(params)
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t('pages.imageEditor.replaceColor.title')}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {t('pages.imageEditor.replaceColor.pickHint')}
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
            {t('pages.imageEditor.replaceColor.sampledColor')}
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
          label={t('pages.imageEditor.replaceColor.fuzziness')}
          value={fuzziness}
          min={0}
          max={200}
          step={1}
          onChange={setFuzziness}
        />
        <Slider
          label={t('pages.imageEditor.replaceColor.hueShift')}
          value={hueShift}
          min={-180}
          max={180}
          step={1}
          onChange={setHueShift}
          unit="°"
        />
        <Slider
          label={t('pages.imageEditor.replaceColor.saturationShift')}
          value={satShift}
          min={-100}
          max={100}
          step={1}
          onChange={setSatShift}
        />
        <Slider
          label={t('pages.imageEditor.replaceColor.lightnessShift')}
          value={lightShift}
          min={-100}
          max={100}
          step={1}
          onChange={setLightShift}
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
