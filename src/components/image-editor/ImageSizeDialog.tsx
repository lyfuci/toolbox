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
 * Image > Image Size. Resamples the underlying image to new W×H. Other layers
 * scale proportionally (handled at the call site via scaleLayer).
 *
 * - "Constrain proportions" locks the W/H ratio when toggling either input.
 * - Percent mode swaps the input units; the underlying state still stores
 *   absolute pixel dims and we round at apply time.
 */
type Props = {
  open: boolean
  /** Current image dimensions in source pixels. */
  current: { w: number; h: number }
  onApply: (next: { w: number; h: number }) => void
  onCancel: () => void
}

export function ImageSizeDialog({ open, current, onApply, onCancel }: Props) {
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
  onApply: (next: { w: number; h: number }) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [w, setW] = useState(current.w)
  const [h, setH] = useState(current.h)
  const [constrain, setConstrain] = useState(true)
  const [unit, setUnit] = useState<'px' | '%'>('px')
  const aspectRef = current.w / current.h
  // Initial sync happens via the parent's `key` on this inner component —
  // when `current` changes, the parent remounts and `useState(current.w)`
  // re-seeds. No setState-in-effect needed.

  const setWidthLinked = (next: number) => {
    setW(next)
    if (constrain) setH(Math.max(1, Math.round(next / aspectRef)))
  }
  const setHeightLinked = (next: number) => {
    setH(next)
    if (constrain) setW(Math.max(1, Math.round(next * aspectRef)))
  }

  const toPercent = (val: number, base: number) => Math.round((val / base) * 100)
  const fromPercent = (pct: number, base: number) => Math.max(1, Math.round((pct / 100) * base))

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('pages.imageEditor.imageSize.title')}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground">
          {t('pages.imageEditor.imageSize.currentSize', {
            w: current.w,
            h: current.h,
          })}
        </div>
        <div className="flex items-center gap-2">
          <Label className="w-20 text-xs text-muted-foreground">
            {t('pages.imageEditor.imageSize.unit')}
          </Label>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as 'px' | '%')}
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          >
            <option value="px">px</option>
            <option value="%">%</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="w-20 text-xs text-muted-foreground">
            {t('pages.imageEditor.imageSize.width')}
          </Label>
          <input
            type="number"
            min={1}
            value={unit === 'px' ? w : toPercent(w, current.w)}
            onChange={(e) => {
              const v = Number(e.target.value)
              setWidthLinked(unit === 'px' ? v : fromPercent(v, current.w))
            }}
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="w-20 text-xs text-muted-foreground">
            {t('pages.imageEditor.imageSize.height')}
          </Label>
          <input
            type="number"
            min={1}
            value={unit === 'px' ? h : toPercent(h, current.h)}
            onChange={(e) => {
              const v = Number(e.target.value)
              setHeightLinked(unit === 'px' ? v : fromPercent(v, current.h))
            }}
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={constrain}
            onChange={(e) => setConstrain(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          {t('pages.imageEditor.imageSize.constrain')}
        </label>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          {t('pages.imageEditor.cancel')}
        </Button>
        <Button onClick={() => onApply({ w, h })}>
          {t('pages.imageEditor.apply')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
