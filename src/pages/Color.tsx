import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  contrastRatio,
  formatHsl,
  formatOklch,
  formatRgb,
  hslToRgb,
  paletteAnalogous,
  paletteComplementary,
  paletteShades,
  paletteTints,
  paletteTriadic,
  parseHex,
  parseHsl,
  parseRgb,
  rgbToHex,
  rgbToHsl,
  rgbToOklch,
  type RGB,
} from '@/lib/color'

const SAMPLE: RGB = { r: 88, g: 130, b: 246 }
const SAMPLE_BG: RGB = { r: 255, g: 255, b: 255 }

type PaletteKind = 'complementary' | 'analogous' | 'triadic' | 'tints' | 'shades'

function buildPalette(kind: PaletteKind, rgb: RGB): RGB[] {
  switch (kind) {
    case 'complementary':
      return paletteComplementary(rgb)
    case 'analogous':
      return paletteAnalogous(rgb)
    case 'triadic':
      return paletteTriadic(rgb)
    case 'tints':
      return paletteTints(rgb)
    case 'shades':
      return paletteShades(rgb)
  }
}

export function ColorPage() {
  const { t } = useTranslation()
  const [rgb, setRgb] = useState<RGB>(SAMPLE)
  const [bgRgb, setBgRgb] = useState<RGB>(SAMPLE_BG)
  const [paletteKind, setPaletteKind] = useState<PaletteKind>('complementary')

  const hex = rgbToHex(rgb)
  const hsl = rgbToHsl(rgb)
  const oklch = rgbToOklch(rgb)
  const rgbStr = formatRgb(rgb)
  const hslStr = formatHsl(hsl)
  const oklchStr = formatOklch(oklch)

  const updateFromHex = (s: string) => {
    const parsed = parseHex(s)
    if (parsed) setRgb(parsed)
  }
  const updateFromRgb = (s: string) => {
    const parsed = parseRgb(s)
    if (parsed) setRgb(parsed)
  }
  const updateFromHsl = (s: string) => {
    const parsed = parseHsl(s)
    if (parsed) setRgb(hslToRgb(parsed))
  }

  const ratio = contrastRatio(rgb, bgRgb)
  const ratioStr = ratio.toFixed(2)

  const palette = buildPalette(paletteKind, rgb)

  const handleCopy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value)
    toast.success(t('common.copiedLabel', { label }))
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.color.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.color.description')}</p>
      </header>

      <div className="mb-6 flex items-center gap-4">
        <div
          className="h-24 w-24 shrink-0 rounded-lg border border-border shadow-sm"
          style={{ backgroundColor: hex }}
          aria-label="color preview"
        />
        <input
          type="color"
          value={hex}
          onChange={(e) => updateFromHex(e.target.value)}
          className="h-24 w-24 cursor-pointer rounded-lg border border-border bg-transparent"
        />
      </div>

      {/* RGB sliders */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(
          [
            ['R', rgb.r, (v: number) => setRgb({ ...rgb, r: v }), 255],
            ['G', rgb.g, (v: number) => setRgb({ ...rgb, g: v }), 255],
            ['B', rgb.b, (v: number) => setRgb({ ...rgb, b: v }), 255],
          ] as [string, number, (v: number) => void, number][]
        ).map(([label, value, onChange, max]) => (
          <div key={label} className="flex items-center gap-3">
            <Label className="w-6 shrink-0 text-xs font-medium text-muted-foreground">
              {label}
            </Label>
            <input
              type="range"
              min={0}
              max={max}
              value={Math.round(value)}
              onChange={(e) => onChange(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <Input
              type="number"
              min={0}
              max={max}
              value={Math.round(value)}
              onChange={(e) => onChange(Number(e.target.value))}
              className="w-16 font-mono text-xs"
            />
          </div>
        ))}
      </div>

      {/* HSL sliders */}
      <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(
          [
            ['H', hsl.h, (v: number) => setRgb(hslToRgb({ ...hsl, h: v })), 360, '°'],
            ['S', hsl.s, (v: number) => setRgb(hslToRgb({ ...hsl, s: v })), 100, '%'],
            ['L', hsl.l, (v: number) => setRgb(hslToRgb({ ...hsl, l: v })), 100, '%'],
          ] as [string, number, (v: number) => void, number, string][]
        ).map(([label, value, onChange, max, suffix]) => (
          <div key={label} className="flex items-center gap-3">
            <Label className="w-6 shrink-0 text-xs font-medium text-muted-foreground">
              {label}
            </Label>
            <input
              type="range"
              min={0}
              max={max}
              value={Math.round(value)}
              onChange={(e) => onChange(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <div className="flex w-16 shrink-0 items-center gap-1">
              <Input
                type="number"
                min={0}
                max={max}
                value={Math.round(value)}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-12 font-mono text-xs"
              />
              <span className="text-xs text-muted-foreground">{suffix}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Format outputs */}
      <div className="mb-6 flex flex-col gap-3">
        {[
          { label: 'HEX', value: hex, onChange: updateFromHex, editable: true },
          { label: 'RGB', value: rgbStr, onChange: updateFromRgb, editable: true },
          { label: 'HSL', value: hslStr, onChange: updateFromHsl, editable: true },
          { label: 'OKLCH', value: oklchStr, onChange: () => {}, editable: false },
        ].map(({ label, value, onChange, editable }) => (
          <div key={label} className="flex items-center gap-3">
            <Label className="w-14 shrink-0 text-xs font-medium text-muted-foreground">
              {label}
            </Label>
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              readOnly={!editable}
              spellCheck={false}
              className="font-mono text-sm"
            />
            <Button size="sm" variant="ghost" onClick={() => handleCopy(label, value)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      {/* WCAG Contrast */}
      <section className="mb-6 rounded-lg border border-border bg-card/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">{t('pages.color.contrast')}</h2>
          <code className="font-mono text-sm">{ratioStr}:1</code>
        </div>
        <div className="mb-3 flex items-center gap-3">
          <Label className="w-24 shrink-0 text-xs text-muted-foreground">
            {t('pages.color.background')}
          </Label>
          <input
            type="color"
            value={rgbToHex(bgRgb)}
            onChange={(e) => {
              const p = parseHex(e.target.value)
              if (p) setBgRgb(p)
            }}
            className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"
          />
          <Input
            value={rgbToHex(bgRgb)}
            onChange={(e) => {
              const p = parseHex(e.target.value)
              if (p) setBgRgb(p)
            }}
            spellCheck={false}
            className="w-32 font-mono text-sm"
          />
        </div>

        <div
          className="mb-3 rounded-md p-4 text-base"
          style={{ backgroundColor: rgbToHex(bgRgb), color: hex }}
        >
          {t('pages.color.contrastSample')}
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <ContrastBadge
            label={`AA ${t('pages.color.normalText')}`}
            ok={ratio >= 4.5}
            t={t}
          />
          <ContrastBadge
            label={`AA ${t('pages.color.largeText')}`}
            ok={ratio >= 3}
            t={t}
          />
          <ContrastBadge
            label={`AAA ${t('pages.color.normalText')}`}
            ok={ratio >= 7}
            t={t}
          />
          <ContrastBadge
            label={`AAA ${t('pages.color.largeText')}`}
            ok={ratio >= 4.5}
            t={t}
          />
        </div>
      </section>

      {/* Palettes */}
      <section className="rounded-lg border border-border bg-card/40 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-sm font-medium">{t('pages.color.palettes')}</h2>
          {(
            ['complementary', 'analogous', 'triadic', 'tints', 'shades'] as PaletteKind[]
          ).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setPaletteKind(k)}
              className={`rounded-md border border-input px-2.5 py-1 text-xs transition-colors ${
                paletteKind === k
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(`pages.color.paletteKinds.${k}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {palette.map((c, i) => {
            const cHex = rgbToHex(c)
            return (
              <button
                key={`${cHex}-${i}`}
                type="button"
                onClick={() => handleCopy(cHex, cHex)}
                className="group flex w-24 flex-col items-center gap-1 rounded-md border border-border bg-background p-1 hover:bg-accent/30"
              >
                <div
                  className="h-14 w-full rounded"
                  style={{ backgroundColor: cHex }}
                />
                <code className="font-mono text-[10px] text-muted-foreground group-hover:text-foreground">
                  {cHex}
                </code>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function ContrastBadge({
  label,
  ok,
  t,
}: {
  label: string
  ok: boolean
  t: (k: string) => string
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`font-mono ${ok ? 'text-emerald-500' : 'text-destructive'}`}
      >
        {ok ? t('pages.color.pass') : t('pages.color.fail')}
      </span>
    </div>
  )
}
