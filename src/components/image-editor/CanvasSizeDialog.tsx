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

/**
 * Image > Canvas Size. Resizes the canvas (NOT the image content); a 9-point
 * anchor positions the existing content within the new bounds and a colour
 * picker chooses the fill for any newly-revealed area.
 *
 * Anchor is laid out as a 3×3 grid; the user clicks one cell to set both
 * direction defaults — content stays anchored to that cell while the canvas
 * expands / contracts around it.
 */
type Props = {
  open: boolean
  current: { w: number; h: number }
  onApply: (args: {
    w: number
    h: number
    anchor: Anchor9
    bgColor: string
  }) => void
  onCancel: () => void
}

export type Anchor9 =
  | 'nw' | 'n' | 'ne'
  | 'w'  | 'c' | 'e'
  | 'sw' | 's' | 'se'

const ANCHOR_GRID: Anchor9[][] = [
  ['nw', 'n', 'ne'],
  ['w', 'c', 'e'],
  ['sw', 's', 'se'],
]

export function CanvasSizeDialog({ open, current, onApply, onCancel }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel()
      }}
    >
      {open && (
        <Inner
          key={`${current.w}x${current.h}`}
          current={current}
          onApply={onApply}
          onCancel={onCancel}
        />
      )}
    </Dialog>
  )
}

function Inner({
  current,
  onApply,
  onCancel,
}: {
  current: { w: number; h: number }
  onApply: (args: { w: number; h: number; anchor: Anchor9; bgColor: string }) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [w, setW] = useState(current.w)
  const [h, setH] = useState(current.h)
  const [anchor, setAnchor] = useState<Anchor9>('c')
  const [bgColor, setBgColor] = useState('#ffffff')
  // Initial sync via parent `key` on remount — see ImageSizeDialog.

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('pages.imageEditor.canvasSize.title')}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground">
          {t('pages.imageEditor.canvasSize.currentSize', {
            w: current.w,
            h: current.h,
          })}
        </div>
        <div className="flex items-center gap-2">
          <Label className="w-20 text-xs text-muted-foreground">
            {t('pages.imageEditor.canvasSize.width')}
          </Label>
          <input
            type="number"
            min={1}
            value={w}
            onChange={(e) => setW(Math.max(1, Number(e.target.value)))}
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="w-20 text-xs text-muted-foreground">
            {t('pages.imageEditor.canvasSize.height')}
          </Label>
          <input
            type="number"
            min={1}
            value={h}
            onChange={(e) => setH(Math.max(1, Number(e.target.value)))}
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          />
        </div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">
            {t('pages.imageEditor.canvasSize.anchor')}
          </div>
          <div className="inline-grid grid-cols-3 gap-1">
            {ANCHOR_GRID.flat().map((a) => (
              <button
                key={a}
                onClick={() => setAnchor(a)}
                className={`h-7 w-7 rounded border text-xs ${
                  anchor === a
                    ? 'border-primary bg-accent'
                    : 'border-border/60 hover:bg-accent/40'
                }`}
                title={a}
              >
                {anchor === a ? '●' : ''}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label className="w-20 text-xs text-muted-foreground">
            {t('pages.imageEditor.canvasSize.bgColor')}
          </Label>
          <input
            type="color"
            value={bgColor}
            onChange={(e) => setBgColor(e.target.value)}
            className="h-7 w-12 cursor-pointer rounded border border-input bg-transparent"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          {t('pages.imageEditor.cancel')}
        </Button>
        <Button onClick={() => onApply({ w, h, anchor, bgColor })}>
          {t('pages.imageEditor.apply')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
