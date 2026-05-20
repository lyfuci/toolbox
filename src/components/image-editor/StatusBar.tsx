import { useTranslation } from 'react-i18next'
import type { Rect, Tool } from '@/lib/image-editor/types'

type Props = {
  width: number
  height: number
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  tool: Tool
  /** Cursor coords in preview-pixel space (live from Canvas hover). */
  cursor?: { x: number; y: number } | null
  /** Active selection — bbox is shown so users can read off W × H + position. */
  selection?: Rect | null
  /** Total visible layer count (incl. nested) for a "layers: N" readout. */
  layerCount?: number
}

/**
 * PixelForge status bar. Left to right: zoom, doc dimensions, layer count,
 * cursor coords (when over canvas), active selection bbox (when set), tool
 * hint on the far right. Anything optional collapses when the data isn't
 * available — keeps the bar from getting noisy with placeholder dashes.
 */
export function StatusBar({
  width,
  height,
  zoom,
  onZoomReset,
  tool,
  cursor,
  selection,
  layerCount,
}: Props) {
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
      {layerCount !== undefined && (
        <span style={{ borderLeft: '1px solid var(--pf-line-soft)', paddingLeft: 8 }}>
          {t('pages.imageEditor.statusLayers', { n: layerCount })}
        </span>
      )}
      {cursor && (
        <span style={{ borderLeft: '1px solid var(--pf-line-soft)', paddingLeft: 8, fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(cursor.x)}, {Math.round(cursor.y)}
        </span>
      )}
      {selection && selection.w !== 0 && selection.h !== 0 && (
        <span
          style={{ borderLeft: '1px solid var(--pf-line-soft)', paddingLeft: 8, color: 'var(--pf-fg-dim)' }}
          title={t('pages.imageEditor.statusSelectionBbox', {
            x: Math.round(Math.min(selection.x, selection.x + selection.w)),
            y: Math.round(Math.min(selection.y, selection.y + selection.h)),
          })}
        >
          ▭ {Math.round(Math.abs(selection.w))} × {Math.round(Math.abs(selection.h))}
        </span>
      )}
      <span style={{ marginLeft: 'auto', color: 'var(--pf-fg-dim)' }}>
        {t('pages.imageEditor.statusTip', { tool: t(`pages.imageEditor.tool.${tool}`) })}
      </span>
    </div>
  )
}
