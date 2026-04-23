import { useTranslation } from 'react-i18next'
import { Maximize, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Tool } from '@/lib/image-editor/types'

type Props = {
  width: number
  height: number
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  tool: Tool
}

/**
 * PS-style status bar at the bottom of the editor:
 *   <image dimensions>  ·  <zoom level>  +  -  fit  ·  <current tool>
 *
 * Mostly informational; the zoom buttons are the only interactive bits and
 * mirror the keyboard shortcuts. Designed to be unobtrusive (~28px tall).
 */
export function StatusBar({
  width,
  height,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  tool,
}: Props) {
  const { t } = useTranslation()
  const zoomPct = Math.round(zoom * 100)
  return (
    <div className="flex items-center gap-3 border-t border-border bg-card/40 px-3 py-1 text-[11px] text-muted-foreground">
      <span className="font-mono">
        {width} × {height}
      </span>
      <Separator />
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={onZoomOut}
          title="Cmd/Ctrl+- · Shift+Z"
          className="h-6 w-6"
        >
          <Minus className="h-3 w-3" />
        </Button>
        <button
          type="button"
          onClick={onZoomReset}
          title="Cmd/Ctrl+0"
          className="w-12 rounded font-mono text-foreground hover:bg-accent/50"
        >
          {zoomPct}%
        </button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onZoomIn}
          title="Cmd/Ctrl++ · Z"
          className="h-6 w-6"
        >
          <Plus className="h-3 w-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onZoomReset}
          title={t('pages.imageEditor.zoomFit')}
          className="h-6 w-6"
        >
          <Maximize className="h-3 w-3" />
        </Button>
      </div>
      <Separator />
      <span>
        {t('pages.imageEditor.currentTool')}:{' '}
        <span className="text-foreground">{t(`pages.imageEditor.tool.${tool}`)}</span>
      </span>
    </div>
  )
}

function Separator() {
  return <span className="h-3 w-px bg-border" aria-hidden />
}
