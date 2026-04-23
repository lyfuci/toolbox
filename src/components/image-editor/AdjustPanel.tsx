import { useTranslation } from 'react-i18next'
import { FlipHorizontal, FlipVertical, RotateCw, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from './Slider'
import { DEFAULT_ADJUST, DEFAULT_TRANSFORMS } from '@/lib/image-editor/defaults'
import type { Adjustments, Rotation, Transforms } from '@/lib/image-editor/types'

type Props = {
  transforms: Transforms
  setTransforms: (t: Transforms) => void
  adjust: Adjustments
  setAdjust: (a: Adjustments) => void
}

export function AdjustPanel({
  transforms,
  setTransforms,
  adjust,
  setAdjust,
}: Props) {
  const { t } = useTranslation()
  return (
    <div className="space-y-5">
      <Section title={t('pages.imageEditor.transform')}>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              setTransforms({
                ...transforms,
                rotation: ((transforms.rotation + 90) % 360) as Rotation,
              })
            }
          >
            <RotateCw className="h-4 w-4" />
            {t('pages.imageEditor.rotate90')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setTransforms({ ...transforms, flipH: !transforms.flipH })}
          >
            <FlipHorizontal className="h-4 w-4" />
            {t('pages.imageEditor.flipH')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setTransforms({ ...transforms, flipV: !transforms.flipV })}
          >
            <FlipVertical className="h-4 w-4" />
            {t('pages.imageEditor.flipV')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setTransforms({ ...DEFAULT_TRANSFORMS })}>
            <Undo2 className="h-4 w-4" />
            {t('pages.imageEditor.reset')}
          </Button>
        </div>
      </Section>

      <Section title={t('pages.imageEditor.filter')}>
        <Slider
          label={t('pages.imageEditor.brightness')}
          value={adjust.brightness}
          min={0}
          max={200}
          unit="%"
          onChange={(v) => setAdjust({ ...adjust, brightness: v })}
        />
        <Slider
          label={t('pages.imageEditor.contrast')}
          value={adjust.contrast}
          min={0}
          max={200}
          unit="%"
          onChange={(v) => setAdjust({ ...adjust, contrast: v })}
        />
        <Slider
          label={t('pages.imageEditor.saturation')}
          value={adjust.saturation}
          min={0}
          max={200}
          unit="%"
          onChange={(v) => setAdjust({ ...adjust, saturation: v })}
        />
        <Slider
          label={t('pages.imageEditor.grayscale')}
          value={adjust.grayscale}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => setAdjust({ ...adjust, grayscale: v })}
        />
        <Slider
          label={t('pages.imageEditor.blur')}
          value={adjust.blur}
          min={0}
          max={20}
          step={0.5}
          onChange={(v) => setAdjust({ ...adjust, blur: v })}
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setAdjust({ ...DEFAULT_ADJUST })}
          className="w-full"
        >
          <Undo2 className="h-3.5 w-3.5" />
          {t('pages.imageEditor.reset')}
        </Button>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground/70">{title}</Label>
      {children}
    </div>
  )
}
