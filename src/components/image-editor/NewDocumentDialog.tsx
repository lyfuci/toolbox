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
 * File > New (PS: ⌘N). Picks a preset size + background colour and
 * creates a blank canvas. The actual document creation happens in the
 * caller — this dialog just collects (w, h, bgColor) and emits.
 */
type Props = {
  open: boolean
  onCreate: (args: { w: number; h: number; bgColor: string }) => void
  onCancel: () => void
}

type Preset = {
  id: string
  w: number
  h: number
}

const PRESETS: Preset[] = [
  { id: 'web1920', w: 1920, h: 1080 },
  { id: 'web1280', w: 1280, h: 720 },
  { id: 'a4', w: 2480, h: 3508 }, // 300 DPI A4
  { id: 'letter', w: 2550, h: 3300 }, // 300 DPI US Letter
  { id: 'square2048', w: 2048, h: 2048 },
  { id: 'square1024', w: 1024, h: 1024 },
  { id: 'instagram', w: 1080, h: 1080 },
  { id: 'instagramStory', w: 1080, h: 1920 },
]

export function NewDocumentDialog({ open, onCreate, onCancel }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel()
      }}
    >
      {open && <Inner onCreate={onCreate} onCancel={onCancel} />}
    </Dialog>
  )
}

function Inner({
  onCreate,
  onCancel,
}: {
  onCreate: (args: { w: number; h: number; bgColor: string }) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [presetId, setPresetId] = useState<string>(PRESETS[0].id)
  const initial = PRESETS[0]
  const [w, setW] = useState(initial.w)
  const [h, setH] = useState(initial.h)
  const [bgColor, setBgColor] = useState('#ffffff')

  const applyPreset = (id: string) => {
    setPresetId(id)
    const p = PRESETS.find((x) => x.id === id)
    if (p) {
      setW(p.w)
      setH(p.h)
    }
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t('pages.imageEditor.newDoc.title')}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Label className="w-20 text-xs text-muted-foreground">
            {t('pages.imageEditor.newDoc.preset')}
          </Label>
          <select
            value={presetId}
            onChange={(e) => applyPreset(e.target.value)}
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          >
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {t(`pages.imageEditor.newDoc.presets.${p.id}`)} ({p.w} × {p.h})
              </option>
            ))}
            <option value="custom">
              {t('pages.imageEditor.newDoc.presets.custom')}
            </option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="w-20 text-xs text-muted-foreground">
            {t('pages.imageEditor.newDoc.width')}
          </Label>
          <input
            type="number"
            min={1}
            value={w}
            onChange={(e) => {
              setW(Math.max(1, Number(e.target.value) || 1))
              setPresetId('custom')
            }}
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="w-20 text-xs text-muted-foreground">
            {t('pages.imageEditor.newDoc.height')}
          </Label>
          <input
            type="number"
            min={1}
            value={h}
            onChange={(e) => {
              setH(Math.max(1, Number(e.target.value) || 1))
              setPresetId('custom')
            }}
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="w-20 text-xs text-muted-foreground">
            {t('pages.imageEditor.newDoc.bgColor')}
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
        <Button onClick={() => onCreate({ w, h, bgColor })}>
          {t('pages.imageEditor.newDoc.create')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
