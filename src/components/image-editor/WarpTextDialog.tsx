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
import { WARP_STYLES } from '@/lib/image-editor/text-warp'
import type { TextWarp, TextWarpStyle } from '@/lib/image-editor/types'

type Props = {
  open: boolean
  /** The selected text layer's current warp (or a 'none' default). */
  initial: TextWarp
  /** Live preview — fired on every change so the canvas updates behind us. */
  onPreview: (warp: TextWarp) => void
  onApply: (warp: TextWarp) => void
  onCancel: () => void
}

/** Sensible starting warp when the layer had none yet (so the effect shows). */
const DEFAULT_WARP: TextWarp = {
  style: 'arc',
  bend: 50,
  horizontal: 0,
  vertical: 0,
}

/**
 * Warp Text dialog (PS Type > Warp Text). Mirrors AdjustmentDialog's
 * preview/apply/cancel flow: the inner component holds the draft, fires
 * `onPreview` on mount + every change (the parent overlays it on the selected
 * text layer without touching history), commits via `onApply`, reverts via
 * `onCancel`.
 */
export function WarpTextDialog({ open, initial, onPreview, onApply, onCancel }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel()
      }}
    >
      {open && (
        <WarpTextDialogInner
          initial={initial}
          onPreview={onPreview}
          onApply={onApply}
          onCancel={onCancel}
        />
      )}
    </Dialog>
  )
}

function WarpTextDialogInner({
  initial,
  onPreview,
  onApply,
  onCancel,
}: Omit<Props, 'open'>) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<TextWarp>(() => {
    const init = initial.style === 'none' ? DEFAULT_WARP : initial
    onPreview(init) // fire-and-forget initial preview (parent setState only)
    return init
  })

  const update = (patch: Partial<TextWarp>) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    onPreview(next)
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t('pages.imageEditor.warpText.title')}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="flex items-center gap-2">
          <Label className="w-24 text-xs text-muted-foreground">
            {t('pages.imageEditor.warpText.style')}
          </Label>
          <select
            value={draft.style}
            onChange={(e) => update({ style: e.target.value as TextWarpStyle })}
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          >
            {WARP_STYLES.map((st) => (
              <option key={st} value={st}>
                {t(`pages.imageEditor.warpText.styles.${st}`)}
              </option>
            ))}
          </select>
        </div>
        <Slider
          label={t('pages.imageEditor.warpText.bend')}
          value={draft.bend}
          min={-100}
          max={100}
          unit="%"
          onChange={(v) => update({ bend: Math.round(v) })}
        />
        <Slider
          label={t('pages.imageEditor.warpText.horizontal')}
          value={draft.horizontal}
          min={-100}
          max={100}
          unit="%"
          onChange={(v) => update({ horizontal: Math.round(v) })}
        />
        <Slider
          label={t('pages.imageEditor.warpText.vertical')}
          value={draft.vertical}
          min={-100}
          max={100}
          unit="%"
          onChange={(v) => update({ vertical: Math.round(v) })}
        />
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
