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

/**
 * PS-style colour picker. Three coupled inputs:
 *
 *   - HSV "saturation × value" box (drag to pick)
 *   - Hue strip (drag to pick the H)
 *   - RGB / Hex text inputs (manual entry, both directions)
 *
 * The dialog produces a `#rrggbb` string back to the caller. Alpha is not
 * exposed in v1 — callers wanting transparency layer it via opacity sliders
 * (which is how PS works for the foreground/background swatches too).
 */
type Props = {
  open: boolean
  initial: string
  onApply: (hex: string) => void
  onCancel: () => void
}

export function ColorPickerDialog({ open, initial, onApply, onCancel }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel()
      }}
    >
      {open && <Inner key={initial} initial={initial} onApply={onApply} onCancel={onCancel} />}
    </Dialog>
  )
}

function Inner({
  initial,
  onApply,
  onCancel,
}: {
  initial: string
  onApply: (hex: string) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const seed = hexToHsv(initial)
  const [h, setH] = useState(seed.h) // 0..360
  const [s, setS] = useState(seed.s) // 0..1
  const [v, setV] = useState(seed.v) // 0..1

  const hex = hsvToHex(h, s, v)
  const rgb = hexToRgb(hex)

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t('pages.imageEditor.colorPicker.title')}</DialogTitle>
      </DialogHeader>
      <div className="flex gap-3">
        <SvBox h={h} s={s} v={v} onChange={(ns, nv) => { setS(ns); setV(nv) }} />
        <HueStrip h={h} onChange={setH} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div
            className="h-8 w-12 rounded border border-input"
            style={{ background: hex }}
          />
          <input
            type="text"
            value={hex}
            onChange={(e) => {
              const next = hexToHsv(e.target.value)
              setH(next.h)
              setS(next.s)
              setV(next.v)
            }}
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(['r', 'g', 'b'] as const).map((k) => (
            <div key={k} className="flex items-center gap-1">
              <Label className="w-4 text-xs uppercase text-muted-foreground">{k}</Label>
              <input
                type="number"
                min={0}
                max={255}
                value={rgb[k]}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(255, Number(e.target.value) || 0))
                  const nextRgb = { ...rgb, [k]: v }
                  const nextHex = rgbToHex(nextRgb)
                  const nextHsv = hexToHsv(nextHex)
                  setH(nextHsv.h)
                  setS(nextHsv.s)
                  setV(nextHsv.v)
                }}
                className="h-7 flex-1 rounded border border-input bg-background px-1 text-xs text-foreground"
              />
            </div>
          ))}
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          {t('pages.imageEditor.cancel')}
        </Button>
        <Button onClick={() => onApply(hex)}>
          {t('pages.imageEditor.apply')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

/** SV box — fixed-pure-hue background, draggable cursor for (s, v). */
function SvBox({
  h,
  s,
  v,
  onChange,
}: {
  h: number
  s: number
  v: number
  onChange: (s: number, v: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const pick = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect()
      const ns = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const nv = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height))
      onChange(ns, nv)
    }
    const onDown = (e: MouseEvent) => {
      pick(e.clientX, e.clientY)
      const onMove = (ev: MouseEvent) => pick(ev.clientX, ev.clientY)
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
    el.addEventListener('mousedown', onDown)
    return () => el.removeEventListener('mousedown', onDown)
  }, [onChange])

  const bgHue = hsvToHex(h, 1, 1)
  return (
    <div
      ref={ref}
      className="relative h-48 w-48 cursor-crosshair rounded border border-input"
      style={{
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${bgHue})`,
      }}
    >
      <div
        className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
        style={{
          left: `${s * 100}%`,
          top: `${(1 - v) * 100}%`,
        }}
      />
    </div>
  )
}

/** Vertical hue strip — drag for H in [0, 360). */
function HueStrip({ h, onChange }: { h: number; onChange: (h: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const pick = (clientY: number) => {
      const rect = el.getBoundingClientRect()
      const ny = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
      onChange(Math.round(ny * 360))
    }
    const onDown = (e: MouseEvent) => {
      pick(e.clientY)
      const onMove = (ev: MouseEvent) => pick(ev.clientY)
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
    el.addEventListener('mousedown', onDown)
    return () => el.removeEventListener('mousedown', onDown)
  }, [onChange])
  return (
    <div
      ref={ref}
      className="relative h-48 w-6 cursor-ns-resize rounded border border-input"
      style={{
        background:
          'linear-gradient(to bottom, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
      }}
    >
      <div
        className="pointer-events-none absolute left-[-2px] right-[-2px] h-1 -translate-y-1/2 border border-black bg-white"
        style={{ top: `${(h / 360) * 100}%` }}
      />
    </div>
  )
}

// ── Color math helpers ──────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let s = hex.trim().replace('#', '')
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  if (s.length !== 6) return { r: 0, g: 0, b: 0 }
  const n = parseInt(s, 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === R) h = ((G - B) / d) % 6
    else if (max === G) h = (B - R) / d + 2
    else h = (R - G) / d + 4
    h = Math.round(h * 60)
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  return { h, s, v: max }
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s
  const hh = (h % 360) / 60
  const x = c * (1 - Math.abs((hh % 2) - 1))
  let r = 0, g = 0, b = 0
  if (hh < 1) { r = c; g = x }
  else if (hh < 2) { r = x; g = c }
  else if (hh < 3) { g = c; b = x }
  else if (hh < 4) { g = x; b = c }
  else if (hh < 5) { r = x; b = c }
  else { r = c; b = x }
  const m = v - c
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const { r, g, b } = hexToRgb(hex)
  return rgbToHsv(r, g, b)
}

function hsvToHex(h: number, s: number, v: number): string {
  return rgbToHex(hsvToRgb(h, s, v))
}
