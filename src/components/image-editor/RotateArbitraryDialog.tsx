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

/**
 * Image > Image Rotation > Arbitrary. Rotates the canvas + content by an
 * arbitrary angle in degrees. The caller rasterizes-and-rotates because
 * EditorState.transforms only supports 90° increments; here we just collect
 * the angle and emit it.
 */
type Props = {
  open: boolean
  onApply: (degrees: number) => void
  onCancel: () => void
}

export function RotateArbitraryDialog({ open, onApply, onCancel }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel()
      }}
    >
      {open && <Inner onApply={onApply} onCancel={onCancel} />}
    </Dialog>
  )
}

function Inner({
  onApply,
  onCancel,
}: {
  onApply: (degrees: number) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [deg, setDeg] = useState(0)
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('pages.imageEditor.rotateArbitrary.title')}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <Slider
          label={t('pages.imageEditor.rotateArbitrary.angle')}
          value={deg}
          min={-180}
          max={180}
          unit="°"
          onChange={setDeg}
        />
        <div className="text-xs text-muted-foreground">
          {t('pages.imageEditor.rotateArbitrary.hint')}
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          {t('pages.imageEditor.cancel')}
        </Button>
        <Button onClick={() => onApply(deg)}>
          {t('pages.imageEditor.apply')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
