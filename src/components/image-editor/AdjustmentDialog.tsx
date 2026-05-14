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
import { CurvesEditor } from './CurvesEditor'
import { DEFAULT_FOR_KIND } from '@/lib/image-editor/adjustments'
import type {
  AdjustmentKind,
  AdjustmentParams,
  BrightnessContrastParams,
  ColorBalanceParams,
  CurvesParams,
  ExposureParams,
  HueSaturationParams,
  LevelsParams,
  PosterizeParams,
  ThresholdParams,
  VibranceParams,
} from '@/lib/image-editor/types'

type Props = {
  open: AdjustmentKind | null
  onPreview: (params: AdjustmentParams | null) => void
  onApply: (params: AdjustmentParams) => void
  onCancel: () => void
}

/**
 * Modal dialog hosting per-adjustment forms. Renders the right form for the
 * `open` kind. Live preview is fired via `onPreview`; `onApply` commits;
 * `onCancel` closes without committing.
 *
 * Per-kind forms live in this file as small sub-components. Keeping them
 * inline (rather than in 10 separate files) lets reviewers see at a glance
 * which adjustments exist + what knobs each exposes.
 *
 * The draft state lives in an inner component keyed by the open kind — that
 * way each open gets a fresh `useState(initialDefaults)` mount with no
 * setState-in-effect dance. The outer component just dispatches.
 */
export function AdjustmentDialog({ open, onPreview, onApply, onCancel }: Props) {
  return (
    <Dialog
      open={open !== null}
      onOpenChange={(o) => {
        if (!o) onCancel()
      }}
    >
      {open !== null && (
        <AdjustmentDialogInner
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

function AdjustmentDialogInner({
  kind,
  onPreview,
  onApply,
  onCancel,
}: {
  kind: AdjustmentKind
  onPreview: (params: AdjustmentParams | null) => void
  onApply: (params: AdjustmentParams) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  // useState's initializer runs once per mount. Mounting per open kind (via
  // the parent's `key`) gives us a fresh default each time without setState
  // in an effect. Push initial preview lazily via the same initializer
  // technique below.
  const [draft, setDraft] = useState<AdjustmentParams>(() => {
    const init = cloneDefaults(kind)
    // Fire-and-forget initial preview — runs in the same render that mounts
    // us; React tolerates this since onPreview is the parent's setState
    // (only schedules an update).
    onPreview(init)
    return init
  })

  const update = (patch: Partial<AdjustmentParams>) => {
    const next = { ...draft, ...patch } as AdjustmentParams
    setDraft(next)
    onPreview(next)
  }

  const title = t(`pages.imageEditor.adjustments.${kind}`)

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        {draft.kind === 'levels' && <LevelsForm value={draft} onChange={update} />}
        {draft.kind === 'curves' && <CurvesForm value={draft} onChange={update} />}
        {draft.kind === 'posterize' && (
          <PosterizeForm value={draft} onChange={update} />
        )}
        {draft.kind === 'threshold' && (
          <ThresholdForm value={draft} onChange={update} />
        )}
        {draft.kind === 'brightnessContrast' && (
          <BrightnessContrastForm value={draft} onChange={update} />
        )}
        {draft.kind === 'hueSaturation' && (
          <HueSaturationForm value={draft} onChange={update} />
        )}
        {draft.kind === 'colorBalance' && (
          <ColorBalanceForm value={draft} onChange={update} />
        )}
        {draft.kind === 'invert' && (
          <p className="text-sm text-muted-foreground">
            {t('pages.imageEditor.adjustments.invertHint')}
          </p>
        )}
        {draft.kind === 'vibrance' && (
          <VibranceForm value={draft} onChange={update} />
        )}
        {draft.kind === 'exposure' && (
          <ExposureForm value={draft} onChange={update} />
        )}
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

function cloneDefaults(kind: AdjustmentKind): AdjustmentParams {
  const base = DEFAULT_FOR_KIND[kind]
  // Shallow clone is enough for everything except curves which has an array.
  if (base.kind === 'curves') return { ...base, points: base.points.map((p) => ({ ...p })) }
  return { ...base }
}

// ── Per-kind forms ───────────────────────────────────────────────────────

function LevelsForm({
  value,
  onChange,
}: {
  value: LevelsParams
  onChange: (patch: Partial<LevelsParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Slider
        label={t('pages.imageEditor.adjustments.inputBlack')}
        value={value.inputBlack}
        min={0}
        max={254}
        onChange={(v) => onChange({ inputBlack: Math.min(v, value.inputWhite - 1) })}
      />
      <Slider
        label={t('pages.imageEditor.adjustments.inputWhite')}
        value={value.inputWhite}
        min={1}
        max={255}
        onChange={(v) => onChange({ inputWhite: Math.max(v, value.inputBlack + 1) })}
      />
      <Slider
        label={t('pages.imageEditor.adjustments.gamma')}
        value={value.gamma}
        min={0.1}
        max={5}
        step={0.01}
        onChange={(v) => onChange({ gamma: v })}
      />
      <Slider
        label={t('pages.imageEditor.adjustments.outputBlack')}
        value={value.outputBlack}
        min={0}
        max={255}
        onChange={(v) => onChange({ outputBlack: v })}
      />
      <Slider
        label={t('pages.imageEditor.adjustments.outputWhite')}
        value={value.outputWhite}
        min={0}
        max={255}
        onChange={(v) => onChange({ outputWhite: v })}
      />
    </>
  )
}

function CurvesForm({
  value,
  onChange,
}: {
  value: CurvesParams
  onChange: (patch: Partial<CurvesParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-2">
      <CurvesEditor points={value.points} onChange={(points) => onChange({ points })} />
      <p className="text-xs text-muted-foreground text-center">
        {t('pages.imageEditor.adjustments.curvesHint')}
      </p>
      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          onChange({
            points: [
              { x: 0, y: 0 },
              { x: 255, y: 255 },
            ],
          })
        }
      >
        {t('pages.imageEditor.reset')}
      </Button>
    </div>
  )
}

function PosterizeForm({
  value,
  onChange,
}: {
  value: PosterizeParams
  onChange: (patch: Partial<PosterizeParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <Slider
      label={t('pages.imageEditor.adjustments.posterizeLevels')}
      value={value.levels}
      min={2}
      max={32}
      onChange={(v) => onChange({ levels: Math.round(v) })}
    />
  )
}

function ThresholdForm({
  value,
  onChange,
}: {
  value: ThresholdParams
  onChange: (patch: Partial<ThresholdParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <Slider
      label={t('pages.imageEditor.adjustments.thresholdValue')}
      value={value.threshold}
      min={0}
      max={255}
      onChange={(v) => onChange({ threshold: Math.round(v) })}
    />
  )
}

function BrightnessContrastForm({
  value,
  onChange,
}: {
  value: BrightnessContrastParams
  onChange: (patch: Partial<BrightnessContrastParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Slider
        label={t('pages.imageEditor.brightness')}
        value={value.brightness}
        min={-100}
        max={100}
        onChange={(v) => onChange({ brightness: Math.round(v) })}
      />
      <Slider
        label={t('pages.imageEditor.contrast')}
        value={value.contrast}
        min={-100}
        max={100}
        onChange={(v) => onChange({ contrast: Math.round(v) })}
      />
    </>
  )
}

function HueSaturationForm({
  value,
  onChange,
}: {
  value: HueSaturationParams
  onChange: (patch: Partial<HueSaturationParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Slider
        label={t('pages.imageEditor.hue')}
        value={value.hue}
        min={-180}
        max={180}
        unit="°"
        onChange={(v) => onChange({ hue: Math.round(v) })}
      />
      <Slider
        label={t('pages.imageEditor.saturation')}
        value={value.saturation}
        min={-100}
        max={100}
        onChange={(v) => onChange({ saturation: Math.round(v) })}
      />
      <Slider
        label={t('pages.imageEditor.adjustments.lightness')}
        value={value.lightness}
        min={-100}
        max={100}
        onChange={(v) => onChange({ lightness: Math.round(v) })}
      />
    </>
  )
}

function ColorBalanceForm({
  value,
  onChange,
}: {
  value: ColorBalanceParams
  onChange: (patch: Partial<ColorBalanceParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Slider
        label={t('pages.imageEditor.adjustments.cyanRed')}
        value={value.cyanRed}
        min={-100}
        max={100}
        onChange={(v) => onChange({ cyanRed: Math.round(v) })}
      />
      <Slider
        label={t('pages.imageEditor.adjustments.magentaGreen')}
        value={value.magentaGreen}
        min={-100}
        max={100}
        onChange={(v) => onChange({ magentaGreen: Math.round(v) })}
      />
      <Slider
        label={t('pages.imageEditor.adjustments.yellowBlue')}
        value={value.yellowBlue}
        min={-100}
        max={100}
        onChange={(v) => onChange({ yellowBlue: Math.round(v) })}
      />
    </>
  )
}

function VibranceForm({
  value,
  onChange,
}: {
  value: VibranceParams
  onChange: (patch: Partial<VibranceParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Slider
        label={t('pages.imageEditor.adjustments.vibrance')}
        value={value.vibrance}
        min={-100}
        max={100}
        onChange={(v) => onChange({ vibrance: Math.round(v) })}
      />
      <Slider
        label={t('pages.imageEditor.saturation')}
        value={value.saturation}
        min={-100}
        max={100}
        onChange={(v) => onChange({ saturation: Math.round(v) })}
      />
    </>
  )
}

function ExposureForm({
  value,
  onChange,
}: {
  value: ExposureParams
  onChange: (patch: Partial<ExposureParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Slider
        label={t('pages.imageEditor.adjustments.exposure')}
        value={value.exposure}
        min={-3}
        max={3}
        step={0.01}
        unit=" EV"
        onChange={(v) => onChange({ exposure: v })}
      />
      <Slider
        label={t('pages.imageEditor.adjustments.offset')}
        value={value.offset}
        min={-0.5}
        max={0.5}
        step={0.01}
        onChange={(v) => onChange({ offset: v })}
      />
      <Slider
        label={t('pages.imageEditor.adjustments.gamma')}
        value={value.gamma}
        min={0.1}
        max={5}
        step={0.01}
        onChange={(v) => onChange({ gamma: v })}
      />
    </>
  )
}
