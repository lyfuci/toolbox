import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Shortcut cheat sheet (`?` key). Static list grouped by category — files /
 * edit / view / select / layer / tools. Lives outside the menu so users
 * can discover shortcuts without trawling through every dropdown.
 *
 * The list is intentionally not pulled from MenuBar / ToolsPalette to avoid
 * a brittle render-tree-introspection coupling; if a shortcut here drifts
 * from the actual binding the only fix is to update both places — annoying
 * but explicit beats magical.
 */
type Group = {
  titleKey: string
  items: Array<{ keys: string; descKey: string }>
}

const GROUPS: Group[] = [
  {
    titleKey: 'pages.imageEditor.shortcuts.tools',
    items: [
      { keys: 'V', descKey: 'pages.imageEditor.tool.none' },
      { keys: 'M', descKey: 'pages.imageEditor.tool.marquee' },
      { keys: 'L', descKey: 'pages.imageEditor.tool.lasso' },
      { keys: 'W', descKey: 'pages.imageEditor.tool.wand' },
      { keys: 'C', descKey: 'pages.imageEditor.tool.crop' },
      { keys: 'I', descKey: 'pages.imageEditor.tool.eyedropper' },
      { keys: 'B', descKey: 'pages.imageEditor.tool.brush' },
      { keys: 'E', descKey: 'pages.imageEditor.tool.eraser' },
      { keys: 'G', descKey: 'pages.imageEditor.tool.bucket' },
      { keys: 'O', descKey: 'pages.imageEditor.tool.dodge' },
      { keys: 'P', descKey: 'pages.imageEditor.tool.pen' },
      { keys: 'A', descKey: 'pages.imageEditor.tool.arrowPath' },
      { keys: 'T', descKey: 'pages.imageEditor.tool.text' },
      { keys: 'U', descKey: 'pages.imageEditor.tool.rect' },
      { keys: 'Z', descKey: 'pages.imageEditor.tool.zoom' },
      { keys: 'Q', descKey: 'pages.imageEditor.shortcuts.toggleQuickMask' },
      { keys: 'X', descKey: 'pages.imageEditor.shortcuts.swapColors' },
      { keys: 'D', descKey: 'pages.imageEditor.shortcuts.defaultColors' },
      { keys: 'Space', descKey: 'pages.imageEditor.shortcuts.pan' },
    ],
  },
  {
    titleKey: 'pages.imageEditor.shortcuts.file',
    items: [
      { keys: '⌘N', descKey: 'pages.imageEditor.menu.newDocument' },
      { keys: '⌘O', descKey: 'pages.imageEditor.menu.open' },
      { keys: '⌘S', descKey: 'pages.imageEditor.menu.saveProject' },
      { keys: '⌘E', descKey: 'pages.imageEditor.menu.exportPng' },
      { keys: '⌥⇧⌘S', descKey: 'pages.imageEditor.menu.saveForWeb' },
    ],
  },
  {
    titleKey: 'pages.imageEditor.shortcuts.edit',
    items: [
      { keys: '⌘Z', descKey: 'pages.imageEditor.menu.undo' },
      { keys: '⇧⌘Z', descKey: 'pages.imageEditor.menu.redo' },
      { keys: '⌘X', descKey: 'pages.imageEditor.menu.cut' },
      { keys: '⌘C', descKey: 'pages.imageEditor.menu.copy' },
      { keys: '⇧⌘C', descKey: 'pages.imageEditor.menu.copyMerged' },
      { keys: '⌘V', descKey: 'pages.imageEditor.menu.paste' },
      { keys: '⇧⌘V', descKey: 'pages.imageEditor.menu.pasteInPlace' },
      { keys: '⌘J', descKey: 'pages.imageEditor.menu.duplicateLayer' },
      { keys: 'Del', descKey: 'pages.imageEditor.menu.deleteLayer' },
      { keys: '⌘G', descKey: 'pages.imageEditor.menu.groupLayers' },
      { keys: '⇧⌘G', descKey: 'pages.imageEditor.menu.ungroupLayers' },
      { keys: '⌘E', descKey: 'pages.imageEditor.menu.mergeDown' },
      { keys: '⇧⌘E', descKey: 'pages.imageEditor.menu.mergeVisible' },
      { keys: '⌥⇧⌘E', descKey: 'pages.imageEditor.menu.stampVisible' },
    ],
  },
  {
    titleKey: 'pages.imageEditor.shortcuts.select',
    items: [
      { keys: '⌘A', descKey: 'pages.imageEditor.menu.selectAll' },
      { keys: '⌘D', descKey: 'pages.imageEditor.menu.deselect' },
      { keys: '⇧⌘D', descKey: 'pages.imageEditor.menu.reselect' },
      { keys: '⇧⌘I', descKey: 'pages.imageEditor.menu.inverse' },
      { keys: 'Shift+drag', descKey: 'pages.imageEditor.shortcuts.selectAdd' },
      { keys: 'Alt+drag', descKey: 'pages.imageEditor.shortcuts.selectSubtract' },
      { keys: '⇧+Alt+drag', descKey: 'pages.imageEditor.shortcuts.selectIntersect' },
    ],
  },
  {
    titleKey: 'pages.imageEditor.shortcuts.view',
    items: [
      { keys: '⌘+', descKey: 'pages.imageEditor.menu.zoomIn' },
      { keys: '⌘-', descKey: 'pages.imageEditor.menu.zoomOut' },
      { keys: '⌘0', descKey: 'pages.imageEditor.menu.zoomFit' },
      { keys: '⌘1', descKey: 'pages.imageEditor.menu.actualPixels' },
      { keys: '⌘\'', descKey: 'pages.imageEditor.menu.showGrid' },
      { keys: '?', descKey: 'pages.imageEditor.shortcuts.openCheatSheet' },
    ],
  },
]

type Props = {
  open: boolean
  onClose: () => void
}

export function ShortcutsDialog({ open, onClose }: Props) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('pages.imageEditor.shortcuts.title')}</DialogTitle>
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
                    <span className="font-mono text-[10px] text-muted-foreground">{it.keys}</span>
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
