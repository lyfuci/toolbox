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

export type SelectModifyKind = 'expand' | 'contract' | 'feather' | 'smooth'

/** Per-kind dialog title + slider-label i18n keys. */
const MODIFY_LABELS: Record<SelectModifyKind, { title: string; label: string }> = {
  expand: {
    title: 'pages.imageEditor.selectMenu.expand',
    label: 'pages.imageEditor.selectMenu.amountPx',
  },
  contract: {
    title: 'pages.imageEditor.selectMenu.contract',
    label: 'pages.imageEditor.selectMenu.amountPx',
  },
  feather: {
    title: 'pages.imageEditor.selectMenu.featherTitle',
    label: 'pages.imageEditor.selectMenu.featherRadius',
  },
  smooth: {
    title: 'pages.imageEditor.selectMenu.smoothTitle',
    label: 'pages.imageEditor.selectMenu.smoothRadius',
  },
}

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
  // Feather defaults a touch lower than the geometric ops — a 1px feather is
  // already visible, whereas a 1px expand is imperceptible.
  const [px, setPx] = useState<number>(kind === 'feather' || kind === 'smooth' ? 4 : 8)
  const { title, label } = MODIFY_LABELS[kind]
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t(title)}</DialogTitle>
      </DialogHeader>
      <div className="py-2">
        <Slider
          label={t(label)}
          value={px}
          min={kind === 'feather' ? 0 : 1}
          max={250}
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
