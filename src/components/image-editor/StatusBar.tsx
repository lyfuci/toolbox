import { useTranslation } from 'react-i18next'
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
 * PixelForge status bar — zoom input + doc dimensions on the left, hint text
 * on the right. Compact (var(--pf-status-h)).
 */
export function StatusBar({ width, height, zoom, onZoomReset, tool }: Props) {
  const { t } = useTranslation()
  const zoomPct = Math.round(zoom * 100)
  return (
    <div className="pf-statusbar">
      <input
        className="pf-zoom-input"
        value={`${zoomPct}%`}
        readOnly
        onClick={onZoomReset}
        title={`${t('pages.imageEditor.zoom')} — ${t('pages.imageEditor.zoomFit')}`}
      />
      <span style={{ borderLeft: '1px solid var(--pf-line-soft)', paddingLeft: 8 }}>
        {width} × {height}
      </span>
      <span style={{ marginLeft: 'auto', color: 'var(--pf-fg-dim)' }}>
        {t('pages.imageEditor.statusTip', { tool: t(`pages.imageEditor.tool.${tool}`) })}
      </span>
    </div>
  )
}
