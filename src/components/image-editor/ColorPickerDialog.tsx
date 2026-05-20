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
 *   - RGB / HSL / Hex text inputs (manual entry, all directions)
 *
 * The dialog produces a `#rrggbb` string back to the caller. Alpha is not
 * exposed in v1 — callers wanting transparency layer it via opacity sliders
 * (which is how PS works for the foreground/background swatches too).
 *
 * Hex input is forgiving: paste / type `ff0000`, `#ff0000`, `f00`, or `#f00`
 * — all work. Invalid input is held in the local buffer until corrected so
 * the user can finish editing without the field snapping back.
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
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)

  // Local string buffers so users can mid-type freely without the field
  // snapping while the value is still incomplete / invalid.
  const [hexBuffer, setHexBuffer] = useState<string | null>(null)
  const [hslBuffer, setHslBuffer] = useState<{ h: string | null; s: string | null; l: string | null }>(
    { h: null, s: null, l: null },
  )
  const hexDisplay = hexBuffer ?? hex

  const applyHexString = (raw: string) => {
    const normalized = parseHexInput(raw)
    if (!normalized) return false
    const next = hexToHsv(normalized)
    setH(next.h)
    setS(next.s)
    setV(next.v)
    setHexBuffer(null)
    setHslBuffer({ h: null, s: null, l: null })
    return true
  }

  const applyHsl = (hh: number, ss: number, ll: number) => {
    const { r, g, b } = hslToRgb(hh, ss, ll)
    const next = rgbToHsv(r, g, b)
    setH(next.h)
    setS(next.s)
    setV(next.v)
    setHexBuffer(null)
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t('pages.imageEditor.colorPicker.title')}</DialogTitle>
      </DialogHeader>
      <div className="flex gap-3">
        <SvBox h={h} s={s} v={v} onChange={(ns, nv) => { setS(ns); setV(nv); setHexBuffer(null); setHslBuffer({ h: null, s: null, l: null }) }} />
        <HueStrip h={h} onChange={(nh) => { setH(nh); setHexBuffer(null); setHslBuffer({ h: null, s: null, l: null }) }} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div
            className="h-8 w-12 rounded border border-input"
            style={{ background: hex }}
          />
          <input
            type="text"
            value={hexDisplay}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(e) => {
              const raw = e.target.value
              setHexBuffer(raw)
              applyHexString(raw)
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text')
              if (parseHexInput(pasted)) {
                e.preventDefault()
                applyHexString(pasted)
              }
              // else fall through to native paste so the user sees their text
            }}
            onBlur={() => {
              // If buffer still doesn't resolve, drop it so we re-show the
              // current canonical hex on next render.
              if (hexBuffer !== null && !parseHexInput(hexBuffer)) {
                setHexBuffer(null)
              }
            }}
            placeholder="#rrggbb"
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground"
          />
          {/* Browser EyeDropper API (Chromium-only — Firefox / Safari
              fall through to the noop toast). Picks any pixel on screen
              while the API's overlay is active. */}
          {typeof window !== 'undefined' && hasEyeDropperApi() && (
            <button
              type="button"
              onClick={async () => {
                try {
                  const picked = await openEyeDropper()
                  if (!picked) return
                  const next = hexToHsv(picked)
                  setH(next.h)
                  setS(next.s)
                  setV(next.v)
                  setHexBuffer(null)
                  setHslBuffer({ h: null, s: null, l: null })
                } catch {
                  /* user cancelled or error — ignore */
                }
              }}
              className="h-8 rounded border border-input bg-background px-2 text-xs text-foreground hover:bg-accent/40"
              title={t('pages.imageEditor.colorPicker.eyedropper')}
            >
              💧
            </button>
          )}
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
                  setHexBuffer(null)
                  setHslBuffer({ h: null, s: null, l: null })
                }}
                className="h-7 flex-1 rounded border border-input bg-background px-1 text-xs text-foreground"
              />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { k: 'h', max: 360, label: t('pages.imageEditor.colorPicker.hsl.h') },
              { k: 's', max: 100, label: t('pages.imageEditor.colorPicker.hsl.s') },
              { k: 'l', max: 100, label: t('pages.imageEditor.colorPicker.hsl.l') },
            ] as const
          ).map(({ k, max, label }) => {
            const numeric = k === 'h' ? hsl.h : k === 's' ? hsl.s : hsl.l
            const buffered = hslBuffer[k]
            const display = buffered ?? String(numeric)
            return (
              <div key={k} className="flex items-center gap-1">
                <Label className="w-4 text-xs uppercase text-muted-foreground">{label}</Label>
                <input
                  type="number"
                  min={0}
                  max={max}
                  value={display}
                  onChange={(e) => {
                    const raw = e.target.value
                    setHslBuffer((b) => ({ ...b, [k]: raw }))
                    if (raw === '' || raw === '-') return
                    const num = Number(raw)
                    if (!Number.isFinite(num)) return
                    const clamped = Math.max(0, Math.min(max, num))
                    const next = {
                      h: k === 'h' ? clamped : hsl.h,
                      s: k === 's' ? clamped : hsl.s,
                      l: k === 'l' ? clamped : hsl.l,
                    }
                    applyHsl(next.h, next.s, next.l)
                  }}
                  onBlur={() => setHslBuffer((b) => ({ ...b, [k]: null }))}
                  className="h-7 flex-1 rounded border border-input bg-background px-1 text-xs text-foreground"
                />
              </div>
            )
          })}
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

// ── Eye-dropper (browser API) ───────────────────────────────────────────

/** Does the current browser ship the EyeDropper API? Chromium-only as of
 *  2024 (Chrome 95+, Edge, Brave, Opera). Firefox / Safari return false. */
function hasEyeDropperApi(): boolean {
  return typeof window !== 'undefined' && 'EyeDropper' in window
}

/** Open the browser's eye-dropper overlay and return the picked sRGB hex,
 *  or null if the user cancelled / the API rejected. */
async function openEyeDropper(): Promise<string | null> {
  const Ctor = (
    window as unknown as {
      EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> }
    }
  ).EyeDropper
  if (!Ctor) return null
  try {
    const ed = new Ctor()
    const result = await ed.open()
    return result?.sRGBHex ?? null
  } catch {
    return null
  }
}

// ── Color math helpers ──────────────────────────────────────────────────

/** Normalize a free-form hex string into `#rrggbb`, or null if it isn't a
 *  valid 3- or 6-digit hex value. Strips `#` and surrounding whitespace,
 *  expands shorthand (`f00` → `ff0000`), and rejects anything with stray
 *  non-hex characters. Used for both manual typing and clipboard paste. */
function parseHexInput(raw: string): string | null {
  let s = raw.trim().replace(/^#/, '').trim()
  if (!/^[0-9a-fA-F]+$/.test(s)) return null
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  if (s.length !== 6) return null
  return `#${s.toLowerCase()}`
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = parseHexInput(hex)
  if (!normalized) return { r: 0, g: 0, b: 0 }
  const n = parseInt(normalized.slice(1), 16)
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

/** RGB (0-255) → HSL with H in [0, 360], S/L in [0, 100] (PS-style ranges).
 *  Standard formula, integer-rounded for display so the inputs show clean
 *  whole numbers. */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const d = max - min
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (d > 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === R) h = ((G - B) / d) % 6
    else if (max === G) h = (B - R) / d + 2
    else h = (R - G) / d + 4
    h = Math.round(h * 60)
    if (h < 0) h += 360
  }
  return { h, s: Math.round(s * 100), l: Math.round(l * 100) }
}

/** HSL (H 0-360, S/L 0-100) → RGB (0-255). Inverse of `rgbToHsl`. */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const H = ((h % 360) + 360) % 360 / 360
  const S = Math.max(0, Math.min(100, s)) / 100
  const L = Math.max(0, Math.min(100, l)) / 100
  if (S === 0) {
    const v = Math.round(L * 255)
    return { r: v, g: v, b: v }
  }
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S
  const p = 2 * L - q
  const hueToRgb = (t: number) => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return {
    r: Math.round(hueToRgb(H + 1 / 3) * 255),
    g: Math.round(hueToRgb(H) * 255),
    b: Math.round(hueToRgb(H - 1 / 3) * 255),
  }
}
