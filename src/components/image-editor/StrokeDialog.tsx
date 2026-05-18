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
import type { StrokePosition } from '@/lib/image-editor/edit-ops'

type Props = {
  open: boolean
  fgColor: string
  onApply: (args: {
    color: string
    width: number
    position: StrokePosition
  }) => void
  onCancel: () => void
}

/**
 * Edit > Stroke dialog. Pick a color (defaults to current FG, customizable),
 * stroke width in preview pixels, and stroke position (inside / center /
 * outside the selection outline).
 */
export function StrokeDialog({ open, fgColor, onApply, onCancel }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel()
      }}
    >
      {open && <StrokeDialogInner fgColor={fgColor} onApply={onApply} onCancel={onCancel} />}
    </Dialog>
  )
}

function StrokeDialogInner({
  fgColor,
  onApply,
  onCancel,
}: {
  fgColor: string
  onApply: (args: { color: string; width: number; position: StrokePosition }) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [color, setColor] = useState(fgColor)
  const [width, setWidth] = useState(4)
  const [position, setPosition] = useState<StrokePosition>('center')

  const positions: { id: StrokePosition; labelKey: string }[] = [
    { id: 'inside', labelKey: 'pages.imageEditor.strokeDialog.inside' },
    { id: 'center', labelKey: 'pages.imageEditor.strokeDialog.center' },
    { id: 'outside', labelKey: 'pages.imageEditor.strokeDialog.outside' },
  ]

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('pages.imageEditor.menu.stroke')}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <Slider
          label={t('pages.imageEditor.strokeDialog.width')}
          value={width}
          min={1}
          max={100}
          step={1}
          onChange={setWidth}
          unit="px"
        />
        <div>
          <div className="mb-1 text-xs text-muted-foreground">
            {t('pages.imageEditor.strokeDialog.color')}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-7 w-12 cursor-pointer rounded border border-border/60"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-7 flex-1 rounded border border-border/60 bg-background px-2 font-mono text-xs"
            />
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">
            {t('pages.imageEditor.strokeDialog.position')}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {positions.map((p) => (
              <button
                key={p.id}
                onClick={() => setPosition(p.id)}
                className={`rounded border px-2 py-1.5 text-xs ${
                  position === p.id
                    ? 'border-primary bg-accent/30'
                    : 'border-border/60 hover:bg-accent/20'
                }`}
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel}>
          {t('pages.imageEditor.cancel')}
        </Button>
        <Button onClick={() => onApply({ color, width, position })}>
          {t('pages.imageEditor.apply')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
