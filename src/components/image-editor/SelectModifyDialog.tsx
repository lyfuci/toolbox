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

export type SelectModifyKind = 'expand' | 'contract'

type Props = {
  /** When set, the modal is open with this operation; null closes it. */
  open: SelectModifyKind | null
  onApply: (kind: SelectModifyKind, px: number) => void
  onCancel: () => void
}

/**
 * Modal for Select > Modify > Expand / Contract. A single pixel-amount
 * slider; the choice of "expand" vs "contract" is fixed per dialog open
 * (PS uses two separate menu items, each opening its own little prompt).
 *
 * No live preview — Modify acts on the abstract selection geometry, not on
 * pixels, so there's nothing to render until Apply commits.
 */
export function SelectModifyDialog({ open, onApply, onCancel }: Props) {
  return (
    <Dialog
      open={open !== null}
      onOpenChange={(o) => {
        if (!o) onCancel()
      }}
    >
      {open !== null && (
        <SelectModifyDialogInner key={open} kind={open} onApply={onApply} onCancel={onCancel} />
      )}
    </Dialog>
  )
}

function SelectModifyDialogInner({
  kind,
  onApply,
  onCancel,
}: {
  kind: SelectModifyKind
  onApply: (kind: SelectModifyKind, px: number) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [px, setPx] = useState<number>(8)
  const titleKey =
    kind === 'expand'
      ? 'pages.imageEditor.selectMenu.expand'
      : 'pages.imageEditor.selectMenu.contract'
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t(titleKey)}</DialogTitle>
      </DialogHeader>
      <div className="py-2">
        <Slider
          label={t('pages.imageEditor.selectMenu.amountPx')}
          value={px}
          min={1}
          max={200}
          step={1}
          onChange={setPx}
          unit="px"
        />
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel}>
          {t('pages.imageEditor.cancel')}
        </Button>
        <Button onClick={() => onApply(kind, px)}>
          {t('pages.imageEditor.apply')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
