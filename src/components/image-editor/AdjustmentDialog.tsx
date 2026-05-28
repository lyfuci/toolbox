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
import { Label } from '@/components/ui/label'
import { Slider } from './Slider'
import { CurvesEditor } from './CurvesEditor'
import { DEFAULT_FOR_KIND } from '@/lib/image-editor/adjustments'
import type {
  AdjustmentKind,
  AdjustmentParams,
  BrightnessContrastParams,
  CameraRawParams,
  ColorBalanceParams,
  CurvesParams,
  ChannelMixerParams,
  ExposureParams,
  GradientMapParams,
  PhotoFilterParams,
  HueSaturationParams,
  LevelsParams,
  PosterizeParams,
  ThresholdParams,
  VibranceParams,
  BlackWhiteParams,
  SelectiveColorParams,
  SelectiveColorRange,
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

  const title = t(
    kind === 'channelMixer' || kind === 'cameraRaw'
      ? `pages.imageEditor.adjustments.${kind}.title`
      : `pages.imageEditor.adjustments.${kind}`,
  )

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
        {draft.kind === 'channelMixer' && (
          <ChannelMixerForm value={draft} onChange={update} />
        )}
        {draft.kind === 'gradientMap' && (
          <GradientMapForm value={draft} onChange={update} />
        )}
        {draft.kind === 'photoFilter' && (
          <PhotoFilterForm value={draft} onChange={update} />
        )}
        {draft.kind === 'cameraRaw' && (
          <CameraRawForm value={draft} onChange={update} />
        )}
        {draft.kind === 'blackWhite' && (
          <BlackWhiteForm value={draft} onChange={update} />
        )}
        {draft.kind === 'selectiveColor' && (
          <SelectiveColorForm value={draft} onChange={update} />
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

type CurvesChannel = 'rgb' | 'r' | 'g' | 'b'

function CurvesForm({
  value,
  onChange,
}: {
  value: CurvesParams
  onChange: (patch: Partial<CurvesParams>) => void
}) {
  const { t } = useTranslation()
  const [channel, setChannel] = useState<CurvesChannel>('rgb')
  const identity = [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ]
  const currentPoints =
    channel === 'rgb'
      ? value.points
      : (value[channel] ?? identity)
  const setCurrentPoints = (points: Array<{ x: number; y: number }>) => {
    if (channel === 'rgb') {
      onChange({ points })
    } else {
      onChange({ [channel]: points } as Partial<CurvesParams>)
    }
  }
  const resetCurrent = () => {
    if (channel === 'rgb') {
      onChange({ points: identity })
    } else {
      // Setting to undefined cleans up the optional field — keeps round-trip
      // JSON minimal for projects that never touched a channel.
      onChange({ [channel]: undefined } as Partial<CurvesParams>)
    }
  }
  const channelTint =
    channel === 'r' ? '#ff5252' : channel === 'g' ? '#52ff7a' : channel === 'b' ? '#5288ff' : undefined
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex w-full items-center gap-1 text-xs">
        <Label className="w-16 text-muted-foreground">
          {t('pages.imageEditor.adjustments.curvesChannel')}
        </Label>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as CurvesChannel)}
          className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
        >
          <option value="rgb">{t('pages.imageEditor.adjustments.curvesChannels.rgb')}</option>
          <option value="r">{t('pages.imageEditor.adjustments.curvesChannels.r')}</option>
          <option value="g">{t('pages.imageEditor.adjustments.curvesChannels.g')}</option>
          <option value="b">{t('pages.imageEditor.adjustments.curvesChannels.b')}</option>
        </select>
      </div>
      <CurvesEditor points={currentPoints} onChange={setCurrentPoints} tint={channelTint} />
      <p className="text-xs text-muted-foreground text-center">
        {t('pages.imageEditor.adjustments.curvesHint')}
      </p>
      <Button size="sm" variant="ghost" onClick={resetCurrent}>
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

/**
 * Channel Mixer — 3 output rows (R / G / B), each with 4 sliders: how much
 * of input R, G, B contributes, plus an additive constant. Identity =
 * 100% matching channel + 0% others + 0 constant. Standard PS layout.
 */
function ChannelMixerForm({
  value,
  onChange,
}: {
  value: ChannelMixerParams
  onChange: (patch: Partial<ChannelMixerParams>) => void
}) {
  const { t } = useTranslation()
  const rows: Array<{
    label: string
    src: 'r' | 'g' | 'b'
  }> = [
    { label: t('pages.imageEditor.adjustments.channelMixer.outR'), src: 'r' },
    { label: t('pages.imageEditor.adjustments.channelMixer.outG'), src: 'g' },
    { label: t('pages.imageEditor.adjustments.channelMixer.outB'), src: 'b' },
  ]
  return (
    <>
      {rows.map((row) => {
        const inR = (`${row.src}OutR`) as keyof ChannelMixerParams
        const inG = (`${row.src}OutG`) as keyof ChannelMixerParams
        const inB = (`${row.src}OutB`) as keyof ChannelMixerParams
        const cst = (`${row.src}Constant`) as keyof ChannelMixerParams
        return (
          <div key={row.src} className="mt-2 border-t border-border pt-2">
            <div className="mb-1 text-xs font-medium">{row.label}</div>
            <Slider
              label="R"
              value={value[inR] as number}
              min={-200}
              max={200}
              unit="%"
              onChange={(v) => onChange({ [inR]: v } as Partial<ChannelMixerParams>)}
            />
            <Slider
              label="G"
              value={value[inG] as number}
              min={-200}
              max={200}
              unit="%"
              onChange={(v) => onChange({ [inG]: v } as Partial<ChannelMixerParams>)}
            />
            <Slider
              label="B"
              value={value[inB] as number}
              min={-200}
              max={200}
              unit="%"
              onChange={(v) => onChange({ [inB]: v } as Partial<ChannelMixerParams>)}
            />
            <Slider
              label={t('pages.imageEditor.adjustments.channelMixer.constant')}
              value={value[cst] as number}
              min={-100}
              max={100}
              onChange={(v) => onChange({ [cst]: v } as Partial<ChannelMixerParams>)}
            />
          </div>
        )
      })}
    </>
  )
}

/**
 * Gradient Map form. Two colour pickers (black → end of luminance ramp).
 * No other knobs in v1 — Photoshop's gradient editor with multi-stop
 * gradients is bigger than this dialog should be.
 */
function GradientMapForm({
  value,
  onChange,
}: {
  value: GradientMapParams
  onChange: (patch: Partial<GradientMapParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex items-center gap-2">
        <Label className="w-24 text-xs text-muted-foreground">
          {t('pages.imageEditor.adjustments.gradientMapStops.dark')}
        </Label>
        <input
          type="color"
          value={value.color}
          onChange={(e) => onChange({ color: e.target.value })}
          className="h-7 w-12 cursor-pointer rounded border border-input bg-transparent"
        />
      </div>
      <div className="flex items-center gap-2">
        <Label className="w-24 text-xs text-muted-foreground">
          {t('pages.imageEditor.adjustments.gradientMapStops.light')}
        </Label>
        <input
          type="color"
          value={value.endColor}
          onChange={(e) => onChange({ endColor: e.target.value })}
          className="h-7 w-12 cursor-pointer rounded border border-input bg-transparent"
        />
      </div>
    </>
  )
}

/**
 * Photo Filter form. Preset chooser + custom color + density slider +
 * preserve-luminosity toggle. The presets match Photoshop's: 85 warming,
 * 80 cooling, sepia, etc.
 */
const PHOTO_FILTER_PRESETS: Array<{ label: string; color: string }> = [
  { label: 'warming85', color: '#ec8a00' },
  { label: 'warming81', color: '#ebb113' },
  { label: 'cooling80', color: '#006dff' },
  { label: 'cooling82', color: '#00b5ff' },
  { label: 'sepia', color: '#ac7a33' },
  { label: 'red', color: '#ea1d22' },
  { label: 'green', color: '#00a651' },
  { label: 'blue', color: '#0072bc' },
]
function PhotoFilterForm({
  value,
  onChange,
}: {
  value: PhotoFilterParams
  onChange: (patch: Partial<PhotoFilterParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex items-center gap-2">
        <Label className="w-24 text-xs text-muted-foreground">
          {t('pages.imageEditor.adjustments.photoFilterPreset')}
        </Label>
        <select
          value={
            PHOTO_FILTER_PRESETS.find((p) => p.color === value.color)?.label ??
            'custom'
          }
          onChange={(e) => {
            const found = PHOTO_FILTER_PRESETS.find((p) => p.label === e.target.value)
            if (found) onChange({ color: found.color })
          }}
          className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
        >
          {PHOTO_FILTER_PRESETS.map((p) => (
            <option key={p.label} value={p.label}>
              {t(`pages.imageEditor.adjustments.photoFilterPresets.${p.label}`)}
            </option>
          ))}
          <option value="custom">
            {t('pages.imageEditor.adjustments.photoFilterPresets.custom')}
          </option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <Label className="w-24 text-xs text-muted-foreground">
          {t('pages.imageEditor.adjustments.photoFilterColor')}
        </Label>
        <input
          type="color"
          value={value.color}
          onChange={(e) => onChange({ color: e.target.value })}
          className="h-7 w-12 cursor-pointer rounded border border-input bg-transparent"
        />
      </div>
      <Slider
        label={t('pages.imageEditor.adjustments.photoFilterDensity')}
        value={value.density}
        min={0}
        max={100}
        unit="%"
        onChange={(v) => onChange({ density: v })}
      />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={value.preserveLuminosity}
          onChange={(e) => onChange({ preserveLuminosity: e.target.checked })}
          className="h-3.5 w-3.5 accent-primary"
        />
        {t('pages.imageEditor.adjustments.photoFilterPreserveLum')}
      </label>
    </>
  )
}

/**
 * Camera Raw form. Eleven sliders organised into three sections (white
 * balance / tone / presence) mirroring Lightroom's basic panel. All
 * adjustments compose into a single per-pixel pass; clarity / dehaze are
 * approximated globally — see applyCameraRaw for the implementation note.
 */
function CameraRawForm({
  value,
  onChange,
}: {
  value: CameraRawParams
  onChange: (patch: Partial<CameraRawParams>) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
      <div className="text-xs font-medium text-muted-foreground">
        {t('pages.imageEditor.adjustments.cameraRaw.wb')}
      </div>
      <Slider
        label={t('pages.imageEditor.adjustments.cameraRaw.temperature')}
        value={value.temperature}
        min={-100}
        max={100}
        onChange={(v) => onChange({ temperature: v })}
      />
      <Slider
        label={t('pages.imageEditor.adjustments.cameraRaw.tint')}
        value={value.tint}
        min={-100}
        max={100}
        onChange={(v) => onChange({ tint: v })}
      />
      <div className="text-xs font-medium text-muted-foreground pt-2">
        {t('pages.imageEditor.adjustments.cameraRaw.tone')}
      </div>
      <Slider
        label={t('pages.imageEditor.adjustments.cameraRaw.exposure')}
        value={value.exposure}
        min={-2}
        max={2}
        step={0.01}
        unit="EV"
        onChange={(v) => onChange({ exposure: v })}
      />
      <Slider
        label={t('pages.imageEditor.adjustments.cameraRaw.highlights')}
        value={value.highlights}
        min={-100}
        max={100}
        onChange={(v) => onChange({ highlights: v })}
      />
      <Slider
        label={t('pages.imageEditor.adjustments.cameraRaw.shadows')}
        value={value.shadows}
        min={-100}
        max={100}
        onChange={(v) => onChange({ shadows: v })}
      />
      <Slider
        label={t('pages.imageEditor.adjustments.cameraRaw.whites')}
        value={value.whites}
        min={-100}
        max={100}
        onChange={(v) => onChange({ whites: v })}
      />
      <Slider
        label={t('pages.imageEditor.adjustments.cameraRaw.blacks')}
        value={value.blacks}
        min={-100}
        max={100}
        onChange={(v) => onChange({ blacks: v })}
      />
      <div className="text-xs font-medium text-muted-foreground pt-2">
        {t('pages.imageEditor.adjustments.cameraRaw.presence')}
      </div>
      <Slider
        label={t('pages.imageEditor.adjustments.cameraRaw.clarity')}
        value={value.clarity}
        min={-100}
        max={100}
        onChange={(v) => onChange({ clarity: v })}
      />
      <Slider
        label={t('pages.imageEditor.adjustments.cameraRaw.dehaze')}
        value={value.dehaze}
        min={-100}
        max={100}
        onChange={(v) => onChange({ dehaze: v })}
      />
      <Slider
        label={t('pages.imageEditor.adjustments.cameraRaw.vibrance')}
        value={value.vibrance}
        min={-100}
        max={100}
        onChange={(v) => onChange({ vibrance: v })}
      />
      <Slider
        label={t('pages.imageEditor.adjustments.cameraRaw.saturation')}
        value={value.saturation}
        min={-100}
        max={100}
        onChange={(v) => onChange({ saturation: v })}
      />
    </div>
  )
}

function BlackWhiteForm({
  value,
  onChange,
}: {
  value: BlackWhiteParams
  onChange: (patch: Partial<BlackWhiteParams>) => void
}) {
  const { t } = useTranslation()
  const families = ['reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas'] as const
  return (
    <>
      {families.map((f) => (
        <Slider
          key={f}
          label={t(`pages.imageEditor.adjustments.bw.${f}`)}
          value={value[f]}
          min={-200}
          max={300}
          unit="%"
          onChange={(v) => onChange({ [f]: Math.round(v) } as Partial<BlackWhiteParams>)}
        />
      ))}
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={value.tint}
          onChange={(e) => onChange({ tint: e.target.checked })}
        />
        {t('pages.imageEditor.adjustments.bw.tint')}
      </label>
      {value.tint && (
        <>
          <Slider
            label={t('pages.imageEditor.adjustments.bw.tintHue')}
            value={value.tintHue}
            min={0}
            max={360}
            unit="°"
            onChange={(v) => onChange({ tintHue: Math.round(v) })}
          />
          <Slider
            label={t('pages.imageEditor.adjustments.bw.tintSat')}
            value={value.tintSat}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => onChange({ tintSat: Math.round(v) })}
          />
        </>
      )}
    </>
  )
}

const SELECTIVE_RANGES = [
  'reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas', 'whites', 'neutrals', 'blacks',
] as const
type SelRangeKey = (typeof SELECTIVE_RANGES)[number]

function SelectiveColorForm({
  value,
  onChange,
}: {
  value: SelectiveColorParams
  onChange: (patch: Partial<SelectiveColorParams>) => void
}) {
  const { t } = useTranslation()
  // PS edits one range at a time — a dropdown picks the range, 4 sliders edit
  // its CMYK; storage stays the full 9-range object.
  const [range, setRange] = useState<SelRangeKey>('reds')
  const cur = value.ranges[range]
  const patchRange = (patch: Partial<SelectiveColorRange>) =>
    onChange({ ranges: { ...value.ranges, [range]: { ...cur, ...patch } } })
  const cmyk: { key: keyof SelectiveColorRange; label: string }[] = [
    { key: 'c', label: t('pages.imageEditor.adjustments.sel.cyan') },
    { key: 'm', label: t('pages.imageEditor.adjustments.sel.magenta') },
    { key: 'y', label: t('pages.imageEditor.adjustments.sel.yellow') },
    { key: 'k', label: t('pages.imageEditor.adjustments.sel.black') },
  ]
  return (
    <>
      <div className="flex items-center gap-1 text-xs">
        <Label className="w-16 text-muted-foreground">
          {t('pages.imageEditor.adjustments.sel.colors')}
        </Label>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as SelRangeKey)}
          className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
        >
          {SELECTIVE_RANGES.map((r) => (
            <option key={r} value={r}>
              {t(`pages.imageEditor.adjustments.sel.${r}`)}
            </option>
          ))}
        </select>
      </div>
      {cmyk.map(({ key, label }) => (
        <Slider
          key={key}
          label={label}
          value={cur[key]}
          min={-100}
          max={100}
          unit="%"
          onChange={(v) => patchRange({ [key]: Math.round(v) } as Partial<SelectiveColorRange>)}
        />
      ))}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>{t('pages.imageEditor.adjustments.sel.method')}</span>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={value.mode === 'relative'}
            onChange={() => onChange({ mode: 'relative' })}
          />
          {t('pages.imageEditor.adjustments.sel.relative')}
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={value.mode === 'absolute'}
            onChange={() => onChange({ mode: 'absolute' })}
          />
          {t('pages.imageEditor.adjustments.sel.absolute')}
        </label>
      </div>
    </>
  )
}
