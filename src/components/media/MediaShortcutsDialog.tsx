import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

/**
 * Keyboard cheat sheet for the Media editor (`?` key), DaVinci-Resolve-aligned.
 * Static grouped list — mirrors image-editor/ShortcutsDialog. Keep it in sync
 * with the bindings in useMediaShortcuts.ts (and the split/marker/undo handlers
 * wired in Media.tsx); an entry here is a promise the editor must honour.
 */
type Group = {
  titleKey: string
  items: Array<{ keys: string; descKey: string }>
}

const GROUPS: Group[] = [
  {
    titleKey: 'media.shortcuts.groupTransport',
    items: [
      { keys: 'Space', descKey: 'media.shortcuts.playPause' },
      { keys: 'L', descKey: 'media.shortcuts.play' },
      { keys: 'K', descKey: 'media.shortcuts.stop' },
      { keys: 'Home', descKey: 'media.shortcuts.goStart' },
      { keys: 'End', descKey: 'media.shortcuts.goEnd' },
    ],
  },
  {
    titleKey: 'media.shortcuts.groupNavigate',
    items: [
      { keys: '← / →', descKey: 'media.shortcuts.stepFrame' },
      { keys: '⇧← / ⇧→', descKey: 'media.shortcuts.stepSecond' },
      { keys: '↑ / ↓', descKey: 'media.shortcuts.stepClip' },
    ],
  },
  {
    titleKey: 'media.shortcuts.groupEdit',
    items: [
      { keys: 'B  /  ⌘B', descKey: 'media.shortcuts.split' },
      { keys: 'Del', descKey: 'media.shortcuts.delete' },
      { keys: '⇧Del', descKey: 'media.shortcuts.rippleDelete' },
      { keys: '⌘C / ⌘X / ⌘V', descKey: 'media.shortcuts.clipboard' },
      { keys: '⌘D', descKey: 'media.shortcuts.duplicate' },
      { keys: ', / .', descKey: 'media.shortcuts.nudgeFrame' },
      { keys: '< / >', descKey: 'media.shortcuts.nudgeSecond' },
      { keys: 'N', descKey: 'media.shortcuts.snap' },
    ],
  },
  {
    titleKey: 'media.shortcuts.groupMark',
    items: [
      { keys: 'I / O', descKey: 'media.shortcuts.markInOut' },
      { keys: '⇧I / ⇧O', descKey: 'media.shortcuts.gotoInOut' },
      { keys: 'X', descKey: 'media.shortcuts.markClip' },
      { keys: '⌥X', descKey: 'media.shortcuts.clearInOut' },
      { keys: 'M', descKey: 'media.shortcuts.addMarker' },
    ],
  },
  {
    titleKey: 'media.shortcuts.groupView',
    items: [
      { keys: '= / -', descKey: 'media.shortcuts.zoom' },
      { keys: '⇧Z', descKey: 'media.shortcuts.zoomFit' },
      { keys: 'F', descKey: 'media.shortcuts.fullscreen' },
      { keys: '⌘Z / ⇧⌘Z', descKey: 'media.shortcuts.undoRedo' },
      { keys: '?', descKey: 'media.shortcuts.help' },
    ],
  },
]

type Props = {
  open: boolean
  onClose: () => void
}

export function MediaShortcutsDialog({ open, onClose }: Props) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('media.shortcuts.title')}</DialogTitle>
          <DialogDescription>{t('media.shortcuts.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 max-h-[70vh] overflow-y-auto py-2 text-xs">
          {GROUPS.map((g) => (
            <div key={g.titleKey}>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t(g.titleKey)}
              </div>
              <ul className="space-y-0.5">
                {g.items.map((it) => (
                  <li key={`${g.titleKey}-${it.keys}-${it.descKey}`} className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-foreground/90">{t(it.descKey)}</span>
                    <span className="ml-2 shrink-0 font-mono text-[10px] text-muted-foreground">{it.keys}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
