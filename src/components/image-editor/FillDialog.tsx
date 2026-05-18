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
import { BLEND_MODES, type BlendMode } from '@/lib/image-editor/types'
import type { FillKind } from '@/lib/image-editor/edit-ops'

type Props = {
  open: boolean
  fgColor: string
  bgColor: string
  onApply: (args: {
    color: string
    opacity: number
    blend: BlendMode
  }) => void
  onCancel: () => void
}

/**
 * Edit > Fill dialog. Pick a preset (FG / BG / black / white / 50% gray) or
 * a custom color via the color input; tune opacity + blend mode; apply.
 * Mirrors PS's Edit > Fill dialog — the "preset" radio collapses to a fixed
 * value the moment the user reaches for the color picker.
 */
export function FillDialog({ open, fgColor, bgColor, onApply, onCancel }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel()
      }}
    >
      {open && (
        <FillDialogInner
          fgColor={fgColor}
          bgColor={bgColor}
          onApply={onApply}
          onCancel={onCancel}
        />
      )}
    </Dialog>
  )
}

function FillDialogInner({
  fgColor,
  bgColor,
  onApply,
  onCancel,
}: {
  fgColor: string
  bgColor: string
  onApply: (args: { color: string; opacity: number; blend: BlendMode }) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<FillKind>('fg')
  const [custom, setCustom] = useState<string>('#808080')
  const [opacity, setOpacity] = useState(100)
  const [blend, setBlend] = useState<BlendMode>('normal')

  const colorFor = (k: FillKind): string => {
    switch (k) {
      case 'fg':
        return fgColor
      case 'bg':
        return bgColor
      case 'black':
        return '#000000'
      case 'white':
        return '#ffffff'
      case 'gray50':
        return '#808080'
      case 'custom':
        return custom
    }
  }

  const PRESETS: { id: FillKind; labelKey: string }[] = [
    { id: 'fg', labelKey: 'pages.imageEditor.fillDialog.fg' },
    { id: 'bg', labelKey: 'pages.imageEditor.fillDialog.bg' },
    { id: 'black', labelKey: 'pages.imageEditor.fillDialog.black' },
    { id: 'white', labelKey: 'pages.imageEditor.fillDialog.white' },
    { id: 'gray50', labelKey: 'pages.imageEditor.fillDialog.gray50' },
    { id: 'custom', labelKey: 'pages.imageEditor.fillDialog.custom' },
  ]

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('pages.imageEditor.menu.fill')}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div>
          <div className="mb-2 text-xs text-muted-foreground">
            {t('pages.imageEditor.fillDialog.contents')}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setKind(p.id)}
                className={`flex items-center gap-2 rounded border px-2 py-1.5 text-xs ${
                  kind === p.id
                    ? 'border-primary bg-accent/30'
                    : 'border-border/60 hover:bg-accent/20'
                }`}
              >
                <span
                  className="h-4 w-4 shrink-0 rounded-sm border border-border/40"
                  style={{ background: colorFor(p.id) }}
                />
                <span className="truncate">{t(p.labelKey)}</span>
              </button>
            ))}
          </div>
          {kind === 'custom' && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="h-7 w-12 cursor-pointer rounded border border-border/60"
              />
              <input
                type="text"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="h-7 flex-1 rounded border border-border/60 bg-background px-2 font-mono text-xs"
              />
            </div>
          )}
        </div>

        <Slider
          label={t('pages.imageEditor.opacity')}
          value={opacity}
          min={0}
          max={100}
          step={1}
          onChange={setOpacity}
          unit="%"
        />

        <div>
          <div className="mb-1 text-xs text-muted-foreground">
            {t('pages.imageEditor.blend')}
          </div>
          <select
            value={blend}
            onChange={(e) => setBlend(e.target.value as BlendMode)}
            className="h-7 w-full rounded border border-border/60 bg-background px-2 text-xs"
          >
            {BLEND_MODES.map((b) => (
              <option key={b} value={b}>
                {t(`pages.imageEditor.blendMode.${b}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel}>
          {t('pages.imageEditor.cancel')}
        </Button>
        <Button
          onClick={() =>
            onApply({ color: colorFor(kind), opacity: opacity / 100, blend })
          }
        >
          {t('pages.imageEditor.apply')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
