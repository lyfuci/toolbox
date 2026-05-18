import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fileToDataUrl } from '@/lib/image-editor/image-cache'
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
import {
  BLEND_MODES,
  DEFAULT_EFFECTS,
  type BevelEmbossEffect,
  type BlendMode,
  type DropShadowEffect,
  type GradientOverlayEffect,
  type InnerGlowEffect,
  type InnerShadowEffect,
  type LayerEffect,
  type LayerEffectKind,
  type OuterGlowEffect,
  type PatternOverlayEffect,
  type SatinEffect,
  type StrokeEffect,
} from '@/lib/image-editor/types'

/**
 * Layer > Layer Style ("fx") modal. PS-style 2-pane:
 *   - LEFT: effect list with per-effect enable checkboxes; click a row to
 *           focus its parameter panel on the right.
 *   - RIGHT: parameters for the focused effect.
 *
 * The dialog manages a local draft of the effects array and pushes it back
 * via `onApply` on commit; `onCancel` discards. `initial` is the layer's
 * current `effects` array (post-legacy-shadow migration, performed at the
 * call site so the dialog only ever sees the modern format).
 *
 * `initialKind` (optional) preselects the effect parameter panel — used by
 * the Layer > Layer Style submenu where each entry deep-links into one
 * effect; entries with the chosen effect missing pre-add it (enabled).
 */
type Props = {
  open: boolean
  initial: LayerEffect[]
  initialKind?: LayerEffectKind
  onApply: (next: LayerEffect[]) => void
  onCancel: () => void
}

export function LayerStyleDialog({ open, initial, initialKind, onApply, onCancel }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel()
      }}
    >
      {open && (
        <Inner
          initial={initial}
          initialKind={initialKind}
          onApply={onApply}
          onCancel={onCancel}
        />
      )}
    </Dialog>
  )
}

/** UI canonical order for the left-hand effect list. */
const KINDS: LayerEffectKind[] = [
  'dropShadow',
  'innerShadow',
  'outerGlow',
  'innerGlow',
  'stroke',
  'colorOverlay',
  'gradientOverlay',
  'patternOverlay',
  'satin',
  'bevelEmboss',
]

function Inner({
  initial,
  initialKind,
  onApply,
  onCancel,
}: {
  initial: LayerEffect[]
  initialKind?: LayerEffectKind
  onApply: (next: LayerEffect[]) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  // Seed the draft from incoming effects (one row per kind already there)
  // plus, if `initialKind` is set and missing, an enabled default of that
  // kind so the focused panel has something to render.
  const [draft, setDraft] = useState<LayerEffect[]>(() => {
    const map = new Map<LayerEffectKind, LayerEffect>()
    for (const e of initial) map.set(e.kind, e)
    if (initialKind && !map.has(initialKind)) {
      map.set(initialKind, { ...DEFAULT_EFFECTS[initialKind] })
    }
    return Array.from(map.values())
  })
  const [focusedKind, setFocusedKind] = useState<LayerEffectKind>(
    initialKind ?? (initial.find((e) => e.enabled)?.kind ?? initial[0]?.kind ?? 'dropShadow'),
  )

  const byKind = useMemo(() => {
    const m = new Map<LayerEffectKind, LayerEffect>()
    for (const e of draft) m.set(e.kind, e)
    return m
  }, [draft])

  const setEffect = (k: LayerEffectKind, updater: (prev: LayerEffect) => LayerEffect) => {
    setDraft((prev) => {
      const map = new Map<LayerEffectKind, LayerEffect>()
      for (const e of prev) map.set(e.kind, e)
      const existing = map.get(k) ?? { ...DEFAULT_EFFECTS[k] }
      map.set(k, updater(existing))
      return Array.from(map.values())
    })
  }

  const toggleEnabled = (k: LayerEffectKind, on: boolean) => {
    setDraft((prev) => {
      const map = new Map<LayerEffectKind, LayerEffect>()
      for (const e of prev) map.set(e.kind, e)
      if (on) {
        const existing = map.get(k) ?? { ...DEFAULT_EFFECTS[k] }
        map.set(k, { ...existing, enabled: true } as LayerEffect)
      } else if (map.has(k)) {
        const existing = map.get(k)!
        map.set(k, { ...existing, enabled: false } as LayerEffect)
      }
      return Array.from(map.values())
    })
    if (on) setFocusedKind(k)
  }

  const focused = byKind.get(focusedKind)

  return (
    <DialogContent className="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{t('pages.imageEditor.layerStyle.title')}</DialogTitle>
      </DialogHeader>

      <div className="grid grid-cols-[180px_1fr] gap-4">
        <div className="space-y-1 border-r border-border pr-3">
          {KINDS.map((k) => {
            const e = byKind.get(k)
            const enabled = !!e?.enabled
            const isFocus = k === focusedKind
            return (
              <div
                key={k}
                className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs ${
                  isFocus ? 'bg-accent' : 'hover:bg-accent/50'
                }`}
                onClick={() => setFocusedKind(k)}
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(ev) => toggleEnabled(k, ev.target.checked)}
                  onClick={(ev) => ev.stopPropagation()}
                  className="h-3.5 w-3.5 accent-primary"
                />
                <span className={enabled ? 'text-foreground' : 'text-muted-foreground'}>
                  {t(`pages.imageEditor.layerStyle.kind.${k}`)}
                </span>
              </div>
            )
          })}
        </div>

        <div className="min-h-[260px] space-y-3">
          {!focused && (
            <div className="text-xs text-muted-foreground">
              {t('pages.imageEditor.layerStyle.pickFromList')}
            </div>
          )}
          {focused && (
            <EffectPanel
              effect={focused}
              onChange={(next) =>
                setEffect(focused.kind, () => next)
              }
            />
          )}
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          {t('pages.imageEditor.cancel')}
        </Button>
        <Button onClick={() => onApply(draft)}>
          {t('pages.imageEditor.apply')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

/** Per-effect parameter pane. Dispatches on `effect.kind`. */
function EffectPanel({
  effect,
  onChange,
}: {
  effect: LayerEffect
  onChange: (e: LayerEffect) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-foreground">
        {t(`pages.imageEditor.layerStyle.kind.${effect.kind}`)}
      </div>
      <CommonRow effect={effect} onChange={onChange} />
      {effect.kind === 'dropShadow' && (
        <ShadowControls effect={effect} onChange={(e) => onChange(e)} />
      )}
      {effect.kind === 'innerShadow' && (
        <ShadowControls effect={effect} onChange={(e) => onChange(e)} />
      )}
      {effect.kind === 'outerGlow' && (
        <Slider
          label={t('pages.imageEditor.layerStyle.size')}
          value={effect.size}
          min={0}
          max={100}
          unit="px"
          onChange={(v) => onChange({ ...effect, size: v } as OuterGlowEffect)}
        />
      )}
      {effect.kind === 'innerGlow' && (
        <Slider
          label={t('pages.imageEditor.layerStyle.size')}
          value={effect.size}
          min={0}
          max={100}
          unit="px"
          onChange={(v) => onChange({ ...effect, size: v } as InnerGlowEffect)}
        />
      )}
      {effect.kind === 'stroke' && (
        <>
          <Slider
            label={t('pages.imageEditor.layerStyle.width')}
            value={effect.width}
            min={1}
            max={50}
            unit="px"
            onChange={(v) => onChange({ ...effect, width: v } as StrokeEffect)}
          />
          <div className="flex items-center gap-2">
            <Label className="w-16 text-xs text-muted-foreground">
              {t('pages.imageEditor.layerStyle.position')}
            </Label>
            <select
              value={effect.position}
              onChange={(e) =>
                onChange({
                  ...effect,
                  position: e.target.value as StrokeEffect['position'],
                } as StrokeEffect)
              }
              className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              {(['outside', 'center', 'inside'] as const).map((p) => (
                <option key={p} value={p}>
                  {t(`pages.imageEditor.layerStyle.strokePos.${p}`)}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      {effect.kind === 'colorOverlay' && (
        <div className="text-xs text-muted-foreground">
          {t('pages.imageEditor.layerStyle.colorOverlayHint')}
        </div>
      )}
      {effect.kind === 'gradientOverlay' && (
        <>
          <div className="flex items-center gap-2">
            <Label className="w-16 text-xs text-muted-foreground">
              {t('pages.imageEditor.layerStyle.endColor')}
            </Label>
            <input
              type="color"
              value={hexFromColor(effect.endColor)}
              onChange={(e) =>
                onChange({ ...effect, endColor: e.target.value } as GradientOverlayEffect)
              }
              className="h-7 w-12 cursor-pointer rounded border border-input bg-transparent"
            />
          </div>
          <Slider
            label={t('pages.imageEditor.layerStyle.angle')}
            value={effect.angle}
            min={-180}
            max={180}
            unit="°"
            onChange={(v) => onChange({ ...effect, angle: v } as GradientOverlayEffect)}
          />
          <Slider
            label={t('pages.imageEditor.layerStyle.scale')}
            value={effect.scale}
            min={10}
            max={200}
            unit="%"
            onChange={(v) => onChange({ ...effect, scale: v } as GradientOverlayEffect)}
          />
        </>
      )}
      {effect.kind === 'patternOverlay' && (
        <>
          <div className="flex items-center gap-2">
            <Label className="w-16 text-xs text-muted-foreground">
              {t('pages.imageEditor.layerStyle.pattern')}
            </Label>
            <button
              onClick={async () => {
                const file = await pickPatternFile()
                if (!file) return
                const dataUrl = await fileToDataUrl(file)
                // Preload into the browser image cache so the first render
                // after onChange has the pattern available synchronously —
                // otherwise the render-then-load-then-render cycle shows
                // a blank pattern for one paint frame.
                await new Promise<void>((resolve) => {
                  const probe = new Image()
                  probe.onload = () => resolve()
                  probe.onerror = () => resolve()
                  probe.src = dataUrl
                })
                onChange({ ...effect, patternDataUrl: dataUrl } as PatternOverlayEffect)
              }}
              className="rounded border border-input bg-background px-2 py-0.5 text-[11px] hover:bg-accent/40"
            >
              {effect.patternDataUrl
                ? t('pages.imageEditor.layerStyle.replacePattern')
                : t('pages.imageEditor.layerStyle.choosePattern')}
            </button>
            {effect.patternDataUrl && (
              <>
                <img
                  src={effect.patternDataUrl}
                  alt=""
                  className="h-8 w-8 rounded border border-input object-cover"
                />
                <button
                  onClick={() =>
                    onChange({ ...effect, patternDataUrl: '' } as PatternOverlayEffect)
                  }
                  className="text-xs text-muted-foreground hover:text-destructive"
                  title={t('pages.imageEditor.layerStyle.clearPattern')}
                >
                  ×
                </button>
              </>
            )}
          </div>
          {!effect.patternDataUrl && (
            <div className="text-[11px] italic text-muted-foreground">
              {t('pages.imageEditor.layerStyle.patternHint')}
            </div>
          )}
          <Slider
            label={t('pages.imageEditor.layerStyle.scale')}
            value={effect.scale}
            min={10}
            max={200}
            unit="%"
            onChange={(v) => onChange({ ...effect, scale: v } as PatternOverlayEffect)}
          />
        </>
      )}
      {effect.kind === 'satin' && (
        <>
          <Slider
            label={t('pages.imageEditor.layerStyle.angle')}
            value={effect.angle}
            min={-180}
            max={180}
            unit="°"
            onChange={(v) => onChange({ ...effect, angle: v } as SatinEffect)}
          />
          <Slider
            label={t('pages.imageEditor.layerStyle.distance')}
            value={effect.distance}
            min={0}
            max={100}
            unit="px"
            onChange={(v) => onChange({ ...effect, distance: v } as SatinEffect)}
          />
          <Slider
            label={t('pages.imageEditor.layerStyle.size')}
            value={effect.size}
            min={0}
            max={100}
            unit="px"
            onChange={(v) => onChange({ ...effect, size: v } as SatinEffect)}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={effect.invert}
              onChange={(e) =>
                onChange({ ...effect, invert: e.target.checked } as SatinEffect)
              }
              className="h-3.5 w-3.5 accent-primary"
            />
            {t('pages.imageEditor.layerStyle.invert')}
          </label>
        </>
      )}
      {effect.kind === 'bevelEmboss' && (
        <>
          <div className="flex items-center gap-2">
            <Label className="w-16 text-xs text-muted-foreground">
              {t('pages.imageEditor.layerStyle.style')}
            </Label>
            <select
              value={effect.style}
              onChange={(e) =>
                onChange({
                  ...effect,
                  style: e.target.value as BevelEmbossEffect['style'],
                } as BevelEmbossEffect)
              }
              className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              {(['innerBevel', 'outerBevel', 'emboss', 'pillowEmboss'] as const).map(
                (s) => (
                  <option key={s} value={s}>
                    {t(`pages.imageEditor.layerStyle.bevelStyle.${s}`)}
                  </option>
                ),
              )}
            </select>
          </div>
          <Slider
            label={t('pages.imageEditor.layerStyle.depth')}
            value={effect.depth}
            min={1}
            max={100}
            onChange={(v) => onChange({ ...effect, depth: v } as BevelEmbossEffect)}
          />
          <Slider
            label={t('pages.imageEditor.layerStyle.size')}
            value={effect.size}
            min={0}
            max={50}
            unit="px"
            onChange={(v) => onChange({ ...effect, size: v } as BevelEmbossEffect)}
          />
          <Slider
            label={t('pages.imageEditor.layerStyle.angle')}
            value={effect.angle}
            min={-180}
            max={180}
            unit="°"
            onChange={(v) => onChange({ ...effect, angle: v } as BevelEmbossEffect)}
          />
          <Slider
            label={t('pages.imageEditor.layerStyle.altitude')}
            value={effect.altitude}
            min={0}
            max={90}
            unit="°"
            onChange={(v) => onChange({ ...effect, altitude: v } as BevelEmbossEffect)}
          />
          <div className="flex items-center gap-2">
            <Label className="w-16 text-xs text-muted-foreground">
              {t('pages.imageEditor.layerStyle.highlightColor')}
            </Label>
            <input
              type="color"
              value={hexFromColor(effect.highlightColor)}
              onChange={(e) =>
                onChange({ ...effect, highlightColor: e.target.value } as BevelEmbossEffect)
              }
              className="h-7 w-12 cursor-pointer rounded border border-input bg-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="w-16 text-xs text-muted-foreground">
              {t('pages.imageEditor.layerStyle.shadowColor')}
            </Label>
            <input
              type="color"
              value={hexFromColor(effect.shadowColor)}
              onChange={(e) =>
                onChange({ ...effect, shadowColor: e.target.value } as BevelEmbossEffect)
              }
              className="h-7 w-12 cursor-pointer rounded border border-input bg-transparent"
            />
          </div>
        </>
      )}
    </div>
  )
}

/** Color + opacity + blend controls. `color` is omitted for effects that
 *  don't carry a single colour field (pattern overlay, bevel/emboss, gradient
 *  — those expose their own colour pickers in their specialised panes). */
function CommonRow({
  effect,
  onChange,
}: {
  effect: LayerEffect
  onChange: (e: LayerEffect) => void
}) {
  const { t } = useTranslation()
  // Discriminate against the only effect without a top-level `color`.
  const hasColor =
    effect.kind !== 'patternOverlay' && effect.kind !== 'bevelEmboss'
  return (
    <>
      {hasColor && 'color' in effect && (
        <div className="flex items-center gap-2">
          <Label className="w-16 text-xs text-muted-foreground">
            {t('pages.imageEditor.layerStyle.color')}
          </Label>
          <input
            type="color"
            value={hexFromColor(effect.color)}
            onChange={(e) =>
              onChange({ ...effect, color: e.target.value } as LayerEffect)
            }
            className="h-7 w-12 cursor-pointer rounded border border-input bg-transparent"
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        <Label className="w-16 text-xs text-muted-foreground">
          {t('pages.imageEditor.blend')}
        </Label>
        <select
          value={effect.blend}
          onChange={(e) =>
            onChange({ ...effect, blend: e.target.value as BlendMode } as LayerEffect)
          }
          className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
        >
          {BLEND_MODES.map((b) => (
            <option key={b} value={b}>
              {t(`pages.imageEditor.blendMode.${b}`)}
            </option>
          ))}
        </select>
      </div>
      <Slider
        label={t('pages.imageEditor.opacity')}
        value={effect.opacity}
        min={0}
        max={100}
        unit="%"
        onChange={(v) =>
          onChange({ ...effect, opacity: v } as LayerEffect)
        }
      />
    </>
  )
}

/** distance + angle + size — shared between drop shadow and inner shadow. */
function ShadowControls({
  effect,
  onChange,
}: {
  effect: DropShadowEffect | InnerShadowEffect
  onChange: (e: DropShadowEffect | InnerShadowEffect) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Slider
        label={t('pages.imageEditor.layerStyle.distance')}
        value={effect.distance}
        min={0}
        max={200}
        unit="px"
        onChange={(v) => onChange({ ...effect, distance: v })}
      />
      <Slider
        label={t('pages.imageEditor.layerStyle.angle')}
        value={effect.angle}
        min={-180}
        max={180}
        unit="°"
        onChange={(v) => onChange({ ...effect, angle: v })}
      />
      <Slider
        label={t('pages.imageEditor.layerStyle.size')}
        value={effect.size}
        min={0}
        max={100}
        unit="px"
        onChange={(v) => onChange({ ...effect, size: v })}
      />
    </>
  )
}

/** One-shot file picker for Pattern Overlay's image source. Mirrors the
 *  helper in ImageEditor.tsx but kept local so this dialog doesn't pull a
 *  top-level dependency. */
function pickPatternFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

/** Best-effort: pull a #rrggbb out of rgba()/hex/etc for the color input.
 *  (Duplicated from PropertiesPanel — small enough to not warrant extracting,
 *  and decoupled so each component can evolve independently.) */
function hexFromColor(c: string): string {
  if (c.startsWith('#') && c.length >= 7) return c.slice(0, 7)
  const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (m) {
    const hex = (n: string) => Number(n).toString(16).padStart(2, '0')
    return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`
  }
  return '#000000'
}
