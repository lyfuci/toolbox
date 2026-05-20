import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Slider } from './Slider'
import { DEFAULT_FOR_FILTER_KIND, freshNoiseSeed } from '@/lib/image-editor/filter-ops'
import type {
  AddNoiseParams,
  BoxBlurParams,
  EmbossParams,
  FilterKind,
  FilterParams,
  GaussianBlurParams,
  HighPassParams,
  LensFlareParams,
  LocalContrastParams,
  MosaicParams,
  MotionBlurParams,
  PinchParams,
  PolarCoordinatesParams,
  RadialBlurParams,
  SharpenParams,
  SmartSharpenParams,
  SpherizeParams,
  TwirlParams,
  UnsharpMaskParams,
} from '@/lib/image-editor/types'

type Props = {
  open: FilterKind | null
  onPreview: (params: FilterParams | null) => void
  onApply: (params: FilterParams) => void
  onCancel: () => void
}

/**
 * Modal dialog hosting per-filter forms. Mirrors AdjustmentDialog: keyed
 * inner component remounts per open kind so each open gets a fresh
 * `useState(initialDefaults)` without setState-in-effect. Per-kind forms
 * inline so reviewers can see at a glance which filters exist + each one's
 * knobs.
 *
 * Filters that take no parameters (despeckle / findEdges) still show the
 * dialog so the user gets an explicit Apply confirmation — keeps the
 * "menu → dialog → apply" flow consistent across the menu.
 */
export function FilterDialog({ open, onPreview, onApply, onCancel }: Props) {
  return (
    <Dialog
      open={open !== null}
      onOpenChange={(o) => {
        if (!o) onCancel()
      }}
    >
      {open !== null && (
        <FilterDialogInner
          key={open}
          kind={open}
          onPreview={onPreview}
          onApply={onApply}
          onCancel={onCancel}
        />
      )}
    </Dialog>
  )
}

function FilterDialogInner({
  kind,
  onPreview,
  onApply,
  onCancel,
}: {
  kind: FilterKind
  onPreview: (params: FilterParams | null) => void
  onApply: (params: FilterParams) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<FilterParams>(() => {
    const init = cloneDefaults(kind)
    onPreview(init)
    return init
  })

  const update = (patch: Partial<FilterParams>) => {
    const next = { ...draft, ...patch } as FilterParams
    setDraft(next)
    onPreview(next)
  }

  const reset = () => {
    const fresh = cloneDefaults(kind)
    setDraft(fresh)
    onPreview(fresh)
  }

  const title = t(`pages.imageEditor.filters.${kind}`)

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        {draft.kind === 'gaussianBlur' && (
          <GaussianBlurForm value={draft} onChange={update} />
        )}
        {draft.kind === 'boxBlur' && <BoxBlurForm value={draft} onChange={update} />}
        {draft.kind === 'sharpen' && <SharpenForm value={draft} onChange={update} />}
        {draft.kind === 'unsharpMask' && (
          <UnsharpMaskForm value={draft} onChange={update} />
        )}
        {draft.kind === 'highPass' && <HighPassForm value={draft} onChange={update} />}
        {draft.kind === 'addNoise' && <AddNoiseForm value={draft} onChange={update} />}
        {draft.kind === 'despeckle' && (
          <p className="text-sm text-muted-foreground">
            {t('pages.imageEditor.filters.despeckleHint')}
          </p>
        )}
        {draft.kind === 'mosaic' && <MosaicForm value={draft} onChange={update} />}
        {draft.kind === 'findEdges' && (
          <p className="text-sm text-muted-foreground">
            {t('pages.imageEditor.filters.findEdgesHint')}
          </p>
        )}
        {draft.kind === 'emboss' && <EmbossForm value={draft} onChange={update} />}
        {draft.kind === 'localContrast' && (
          <LocalContrastForm value={draft} onChange={update} />
        )}
        {draft.kind === 'motionBlur' && (
          <MotionBlurForm value={draft} onChange={update} />
        )}
        {draft.kind === 'radialBlur' && (
          <RadialBlurForm value={draft} onChange={update} />
        )}
        {draft.kind === 'pinch' && <PinchForm value={draft} onChange={update} />}
        {draft.kind === 'twirl' && <TwirlForm value={draft} onChange={update} />}
        {draft.kind === 'spherize' && (
          <SpherizeForm value={draft} onChange={update} />
        )}
        {draft.kind === 'polarCoordinates' && (
          <PolarCoordinatesForm value={draft} onChange={update} />
        )}
        {draft.kind === 'lensFlare' && (
          <LensFlareForm value={draft} onChange={update} />
        )}
        {draft.kind === 'smartSharpen' && (
          <SmartSharpenForm value={draft} onChange={update} />
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={reset}>
          {t('pages.imageEditor.reset')}
        </Button>
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

function cloneDefaults(kind: FilterKind): FilterParams {
  const base = { ...DEFAULT_FOR_FILTER_KIND[kind] }
  // Seed AddNoise once per dialog open so the preview the user sees matches
  // what gets committed on Apply (rather than re-rolling at apply time and
  // surprising them with a different pattern).
  if (base.kind === 'addNoise') return { ...base, seed: freshNoiseSeed() }
  return base
}

// ── Per-kind forms ───────────────────────────────────────────────────────

function GaussianBlurForm({
  value,
  onChange,
}: {
  value: GaussianBlurParams
  onChange: (patch: Partial<GaussianBlurParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <Slider
      label={t('pages.imageEditor.filters.radius')}
      value={value.radius}
      min={0}
      max={100}
      step={0.1}
      unit=" px"
      onChange={(v) => onChange({ radius: v })}
    />
  )
}

function BoxBlurForm({
  value,
  onChange,
}: {
  value: BoxBlurParams
  onChange: (patch: Partial<BoxBlurParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <Slider
      label={t('pages.imageEditor.filters.radius')}
      value={value.radius}
      min={1}
      max={50}
      unit=" px"
      onChange={(v) => onChange({ radius: Math.round(v) })}
    />
  )
}

function SharpenForm({
  value,
  onChange,
}: {
  value: SharpenParams
  onChange: (patch: Partial<SharpenParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <Slider
      label={t('pages.imageEditor.filters.amount')}
      value={value.amount}
      min={0}
      max={200}
      unit="%"
      onChange={(v) => onChange({ amount: Math.round(v) })}
    />
  )
}

function UnsharpMaskForm({
  value,
  onChange,
}: {
  value: UnsharpMaskParams
  onChange: (patch: Partial<UnsharpMaskParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Slider
        label={t('pages.imageEditor.filters.amount')}
        value={value.amount}
        min={0}
        max={500}
        unit="%"
        onChange={(v) => onChange({ amount: Math.round(v) })}
      />
      <Slider
        label={t('pages.imageEditor.filters.radius')}
        value={value.radius}
        min={0.1}
        max={50}
        step={0.1}
        unit=" px"
        onChange={(v) => onChange({ radius: v })}
      />
      <Slider
        label={t('pages.imageEditor.filters.threshold')}
        value={value.threshold}
        min={0}
        max={255}
        onChange={(v) => onChange({ threshold: Math.round(v) })}
      />
    </>
  )
}

function HighPassForm({
  value,
  onChange,
}: {
  value: HighPassParams
  onChange: (patch: Partial<HighPassParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <Slider
      label={t('pages.imageEditor.filters.radius')}
      value={value.radius}
      min={0.1}
      max={50}
      step={0.1}
      unit=" px"
      onChange={(v) => onChange({ radius: v })}
    />
  )
}

function AddNoiseForm({
  value,
  onChange,
}: {
  value: AddNoiseParams
  onChange: (patch: Partial<AddNoiseParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Slider
        label={t('pages.imageEditor.filters.amount')}
        value={value.amount}
        min={0}
        max={255}
        onChange={(v) => onChange({ amount: Math.round(v) })}
      />
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.monochromatic}
          onChange={(e) => onChange({ monochromatic: e.target.checked })}
          className="h-4 w-4 cursor-pointer accent-primary"
        />
        {t('pages.imageEditor.filters.monochromatic')}
      </label>
    </>
  )
}

function MosaicForm({
  value,
  onChange,
}: {
  value: MosaicParams
  onChange: (patch: Partial<MosaicParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <Slider
      label={t('pages.imageEditor.filters.cellSize')}
      value={value.cellSize}
      min={2}
      max={200}
      unit=" px"
      onChange={(v) => onChange({ cellSize: Math.round(v) })}
    />
  )
}

function EmbossForm({
  value,
  onChange,
}: {
  value: EmbossParams
  onChange: (patch: Partial<EmbossParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Slider
        label={t('pages.imageEditor.filters.angle')}
        value={value.angle}
        min={-180}
        max={180}
        unit="°"
        onChange={(v) => onChange({ angle: Math.round(v) })}
      />
      <Slider
        label={t('pages.imageEditor.filters.height')}
        value={value.height}
        min={1}
        max={10}
        step={0.1}
        unit=" px"
        onChange={(v) => onChange({ height: v })}
      />
      <Slider
        label={t('pages.imageEditor.filters.amount')}
        value={value.amount}
        min={1}
        max={500}
        unit="%"
        onChange={(v) => onChange({ amount: Math.round(v) })}
      />
    </>
  )
}

function LocalContrastForm({
  value,
  onChange,
}: {
  value: LocalContrastParams
  onChange: (patch: Partial<LocalContrastParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Slider
        label={t('pages.imageEditor.filters.clarity')}
        value={value.clarity}
        min={-100}
        max={100}
        onChange={(v) => onChange({ clarity: Math.round(v) })}
      />
      <Slider
        label={t('pages.imageEditor.filters.dehaze')}
        value={value.dehaze}
        min={-100}
        max={100}
        onChange={(v) => onChange({ dehaze: Math.round(v) })}
      />
      <Slider
        label={t('pages.imageEditor.filters.radius')}
        value={value.radius}
        min={1}
        max={100}
        unit=" px"
        onChange={(v) => onChange({ radius: Math.round(v) })}
      />
    </>
  )
}

function MotionBlurForm({
  value,
  onChange,
}: {
  value: MotionBlurParams
  onChange: (patch: Partial<MotionBlurParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Slider
        label={t('pages.imageEditor.filters.angle')}
        value={value.angle}
        min={-180}
        max={180}
        unit="°"
        onChange={(v) => onChange({ angle: Math.round(v) })}
      />
      <Slider
        label={t('pages.imageEditor.filters.distance')}
        value={value.distance}
        min={1}
        max={200}
        unit=" px"
        onChange={(v) => onChange({ distance: Math.round(v) })}
      />
    </>
  )
}

function RadialBlurForm({
  value,
  onChange,
}: {
  value: RadialBlurParams
  onChange: (patch: Partial<RadialBlurParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex items-center gap-2">
        <label className="w-24 text-xs text-muted-foreground">
          {t('pages.imageEditor.filters.radialMode')}
        </label>
        <select
          value={value.mode}
          onChange={(e) => onChange({ mode: e.target.value as RadialBlurParams['mode'] })}
          className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
        >
          <option value="zoom">{t('pages.imageEditor.filters.radialZoom')}</option>
          <option value="spin">{t('pages.imageEditor.filters.radialSpin')}</option>
        </select>
      </div>
      <Slider
        label={t('pages.imageEditor.filters.amount')}
        value={value.amount}
        min={1}
        max={100}
        onChange={(v) => onChange({ amount: Math.round(v) })}
      />
    </>
  )
}

function PinchForm({
  value,
  onChange,
}: {
  value: PinchParams
  onChange: (patch: Partial<PinchParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <Slider
      label={t('pages.imageEditor.filters.amount')}
      value={value.amount}
      min={-100}
      max={100}
      onChange={(v) => onChange({ amount: Math.round(v) })}
    />
  )
}

function TwirlForm({
  value,
  onChange,
}: {
  value: TwirlParams
  onChange: (patch: Partial<TwirlParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <Slider
      label={t('pages.imageEditor.filters.angle')}
      value={value.angle}
      min={-360}
      max={360}
      unit="°"
      onChange={(v) => onChange({ angle: Math.round(v) })}
    />
  )
}

function SpherizeForm({
  value,
  onChange,
}: {
  value: SpherizeParams
  onChange: (patch: Partial<SpherizeParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <Slider
      label={t('pages.imageEditor.filters.amount')}
      value={value.amount}
      min={-100}
      max={100}
      onChange={(v) => onChange({ amount: Math.round(v) })}
    />
  )
}

function PolarCoordinatesForm({
  value,
  onChange,
}: {
  value: PolarCoordinatesParams
  onChange: (patch: Partial<PolarCoordinatesParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2">
      <label className="w-24 text-xs text-muted-foreground">
        {t('pages.imageEditor.filters.polarMode')}
      </label>
      <select
        value={value.mode}
        onChange={(e) =>
          onChange({ mode: e.target.value as PolarCoordinatesParams['mode'] })
        }
        className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
      >
        <option value="polar">{t('pages.imageEditor.filters.polarRectToPolar')}</option>
        <option value="rect">{t('pages.imageEditor.filters.polarPolarToRect')}</option>
      </select>
    </div>
  )
}

function LensFlareForm({
  value,
  onChange,
}: {
  value: LensFlareParams
  onChange: (patch: Partial<LensFlareParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Slider
        label={t('pages.imageEditor.filters.flareX')}
        value={value.x * 100}
        min={0}
        max={100}
        unit="%"
        onChange={(v) => onChange({ x: v / 100 })}
      />
      <Slider
        label={t('pages.imageEditor.filters.flareY')}
        value={value.y * 100}
        min={0}
        max={100}
        unit="%"
        onChange={(v) => onChange({ y: v / 100 })}
      />
      <Slider
        label={t('pages.imageEditor.filters.brightness')}
        value={value.brightness}
        min={0}
        max={200}
        unit="%"
        onChange={(v) => onChange({ brightness: Math.round(v) })}
      />
    </>
  )
}

function SmartSharpenForm({
  value,
  onChange,
}: {
  value: SmartSharpenParams
  onChange: (patch: Partial<SmartSharpenParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Slider
        label={t('pages.imageEditor.filters.amount')}
        value={value.amount}
        min={0}
        max={500}
        unit="%"
        onChange={(v) => onChange({ amount: Math.round(v) })}
      />
      <Slider
        label={t('pages.imageEditor.filters.radius')}
        value={value.radius}
        min={0.5}
        max={50}
        step={0.1}
        unit=" px"
        onChange={(v) => onChange({ radius: v })}
      />
      <Slider
        label={t('pages.imageEditor.filters.threshold')}
        value={value.threshold}
        min={0}
        max={255}
        onChange={(v) => onChange({ threshold: Math.round(v) })}
      />
    </>
  )
}
