import { useTranslation } from 'react-i18next'
import type { Tool } from '@/lib/image-editor/types'

type Props = {
  tool: Tool
  fgColor: string
  setFgColor: (c: string) => void
  bgColor: string
  setBgColor: (c: string) => void
  strokeWidth: number
  setStrokeWidth: (n: number) => void
  bucketTolerance: number
  setBucketTolerance: (n: number) => void
  wandTolerance: number
  setWandTolerance: (n: number) => void
  /** Show "applies to all in fly-out group" notice for stub tools. */
  isStubTool: boolean
  /** Re-fired with the toast pattern when a stub tool was clicked. */
  stubMessage?: string
  /** True when an applied crop is in state — surfaces "Clear crop" button. */
  hasActiveCrop?: boolean
  onClearCrop?: () => void
  /** True when a marquee selection is active — surfaces "Deselect" button. */
  hasSelection?: boolean
  onClearSelection?: () => void
}

/**
 * Options bar — sits below the menu bar and shows context-sensitive controls
 * for the active tool. Each tool gets its own variant: brushes show stroke
 * width + color, crop shows the apply hint, marquee shows feather/anti-alias
 * stubs, etc. For tools that aren't yet implemented we render a banner that
 * tells the user the palette button is a placeholder.
 */
export function OptionsBar({
  tool,
  fgColor,
  setFgColor,
  bgColor,
  setBgColor,
  strokeWidth,
  setStrokeWidth,
  bucketTolerance,
  setBucketTolerance,
  wandTolerance,
  setWandTolerance,
  isStubTool,
  stubMessage,
  hasActiveCrop,
  onClearCrop,
  hasSelection,
  onClearSelection,
}: Props) {
  const { t } = useTranslation()

  if (isStubTool) {
    return (
      <div className="pf-options">
        <div className="pf-opt-group" style={{ borderRight: 0 }}>
          <span className="pf-opt-label" style={{ marginRight: 0 }}>
            {stubMessage ?? t('pages.imageEditor.toolStubHint', { tool: t(`pages.imageEditor.tool.${tool}`) })}
          </span>
        </div>
      </div>
    )
  }

  // Marquee / Lasso / Polygonal Lasso — same shell: hint + "Deselect" when active.
  if (tool === 'marquee' || tool === 'lasso' || tool === 'polyLasso') {
    const hintKey =
      tool === 'lasso'
        ? 'pages.imageEditor.lassoHint'
        : tool === 'polyLasso'
          ? 'pages.imageEditor.polyLassoHint'
          : 'pages.imageEditor.marqueeHint'
    return (
      <div className="pf-options">
        <div className="pf-opt-group">
          <span className="pf-opt-label" style={{ marginRight: 0 }}>
            {t(hintKey)}
          </span>
        </div>
        {hasSelection && (
          <div className="pf-opt-group" style={{ borderRight: 0 }}>
            <button
              type="button"
              className="pf-opt-btn"
              onClick={onClearSelection}
              style={{ width: 'auto', padding: '0 8px' }}
              title={t('pages.imageEditor.deselect')}
            >
              {t('pages.imageEditor.deselect')}
            </button>
          </div>
        )}
      </div>
    )
  }

  // Magic Wand — tolerance slider + hint + Deselect button.
  if (tool === 'wand') {
    return (
      <div className="pf-options">
        <div className="pf-opt-group">
          <span className="pf-opt-label">{t('pages.imageEditor.wandTolerance')}:</span>
          <input
            className="pf-opt-input"
            type="number"
            min={0}
            max={128}
            value={wandTolerance}
            onChange={(e) =>
              setWandTolerance(Math.min(128, Math.max(0, Number(e.target.value) || 0)))
            }
          />
          <input
            type="range"
            min={0}
            max={128}
            value={wandTolerance}
            onChange={(e) => setWandTolerance(Number(e.target.value))}
            style={{ width: 120, accentColor: 'var(--pf-accent)' }}
          />
        </div>
        <div className="pf-opt-group">
          <span className="pf-opt-label" style={{ marginRight: 0 }}>
            {t('pages.imageEditor.wandHint')}
          </span>
        </div>
        {hasSelection && (
          <div className="pf-opt-group" style={{ borderRight: 0 }}>
            <button
              type="button"
              className="pf-opt-btn"
              onClick={onClearSelection}
              style={{ width: 'auto', padding: '0 8px' }}
              title={t('pages.imageEditor.deselect')}
            >
              {t('pages.imageEditor.deselect')}
            </button>
          </div>
        )}
      </div>
    )
  }

  // Brush / pencil / eraser / dodge / burn — stroke width (+ color for brush
  // only; dodge/burn override via mode).
  if (tool === 'brush' || tool === 'eraser' || tool === 'dodge' || tool === 'burn') {
    return (
      <div className="pf-options">
        <div className="pf-opt-group">
          <span className="pf-opt-label">{t('pages.imageEditor.strokeWidth')}:</span>
          <input
            className="pf-opt-input"
            type="number"
            min={1}
            max={200}
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value) || 1)}
          />
        </div>
        {tool === 'brush' && (
          <div className="pf-opt-group">
            <span className="pf-opt-label">{t('pages.imageEditor.color')}:</span>
            <input
              type="color"
              value={fgColor}
              onChange={(e) => setFgColor(e.target.value)}
              style={{
                width: 22,
                height: 22,
                padding: 0,
                border: '1px solid var(--pf-line)',
                background: 'transparent',
                borderRadius: 3,
                cursor: 'pointer',
              }}
            />
          </div>
        )}
        {(tool === 'dodge' || tool === 'burn') && (
          <div className="pf-opt-group" style={{ borderRight: 0 }}>
            <span className="pf-opt-label" style={{ marginRight: 0 }}>
              {tool === 'burn'
                ? t('pages.imageEditor.burnHint')
                : t('pages.imageEditor.dodgeHint')}
            </span>
          </div>
        )}
      </div>
    )
  }

  // Shape tools — stroke width + color.
  if (tool === 'rect' || tool === 'ellipse' || tool === 'line' || tool === 'arrow') {
    return (
      <div className="pf-options">
        <div className="pf-opt-group">
          <span className="pf-opt-label">{t('pages.imageEditor.strokeWidth')}:</span>
          <input
            className="pf-opt-input"
            type="number"
            min={1}
            max={200}
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value) || 1)}
          />
        </div>
        <div className="pf-opt-group">
          <span className="pf-opt-label">{t('pages.imageEditor.color')}:</span>
          <input
            type="color"
            value={fgColor}
            onChange={(e) => setFgColor(e.target.value)}
            style={{
              width: 22,
              height: 22,
              padding: 0,
              border: '1px solid var(--pf-line)',
              background: 'transparent',
              borderRadius: 3,
              cursor: 'pointer',
            }}
          />
        </div>
      </div>
    )
  }

  if (tool === 'crop') {
    return (
      <div className="pf-options">
        <div className="pf-opt-group">
          <span className="pf-opt-label" style={{ marginRight: 0 }}>
            {t('pages.imageEditor.cropPendingHint')}
          </span>
        </div>
        {hasActiveCrop && (
          <div className="pf-opt-group" style={{ borderRight: 0 }}>
            <button
              type="button"
              className="pf-opt-btn"
              onClick={onClearCrop}
              style={{ width: 'auto', padding: '0 8px' }}
              title={t('pages.imageEditor.cropClear')}
            >
              {t('pages.imageEditor.cropClear')}
            </button>
          </div>
        )}
      </div>
    )
  }

  if (tool === 'zoom') {
    return (
      <div className="pf-options">
        <div className="pf-opt-group" style={{ borderRight: 0 }}>
          <span className="pf-opt-label" style={{ marginRight: 0 }}>
            {t('pages.imageEditor.zoomToolHint')}
          </span>
        </div>
      </div>
    )
  }

  if (tool === 'bucket') {
    const swatch: React.CSSProperties = {
      width: 22,
      height: 22,
      padding: 0,
      border: '1px solid var(--pf-line)',
      background: 'transparent',
      borderRadius: 3,
      cursor: 'pointer',
    }
    return (
      <div className="pf-options">
        <div className="pf-opt-group">
          <span className="pf-opt-label">{t('pages.imageEditor.color')}:</span>
          <input
            type="color"
            value={fgColor}
            onChange={(e) => setFgColor(e.target.value)}
            style={swatch}
          />
        </div>
        <div className="pf-opt-group">
          <span className="pf-opt-label">{t('pages.imageEditor.bucketTolerance')}:</span>
          <input
            className="pf-opt-input"
            type="number"
            min={0}
            max={128}
            value={bucketTolerance}
            onChange={(e) => setBucketTolerance(Math.min(128, Math.max(0, Number(e.target.value) || 0)))}
          />
          <input
            type="range"
            min={0}
            max={128}
            value={bucketTolerance}
            onChange={(e) => setBucketTolerance(Number(e.target.value))}
            style={{ width: 120, accentColor: 'var(--pf-accent)' }}
          />
        </div>
        <div className="pf-opt-group" style={{ borderRight: 0 }}>
          <span className="pf-opt-label" style={{ marginRight: 0 }}>
            {t('pages.imageEditor.bucketHint')}
          </span>
        </div>
      </div>
    )
  }

  if (tool === 'gradient') {
    const swatch: React.CSSProperties = {
      width: 22,
      height: 22,
      padding: 0,
      border: '1px solid var(--pf-line)',
      background: 'transparent',
      borderRadius: 3,
      cursor: 'pointer',
    }
    return (
      <div className="pf-options">
        <div className="pf-opt-group">
          <span className="pf-opt-label">{t('pages.imageEditor.fgColor')}:</span>
          <input
            type="color"
            value={fgColor}
            onChange={(e) => setFgColor(e.target.value)}
            style={swatch}
          />
        </div>
        <div className="pf-opt-group">
          <span className="pf-opt-label">{t('pages.imageEditor.bgColor')}:</span>
          <input
            type="color"
            value={bgColor}
            onChange={(e) => setBgColor(e.target.value)}
            style={swatch}
          />
        </div>
        <div className="pf-opt-group" style={{ borderRight: 0 }}>
          <span className="pf-opt-label" style={{ marginRight: 0 }}>
            {t('pages.imageEditor.gradientHint')}
          </span>
        </div>
      </div>
    )
  }

  if (tool === 'eyedropper') {
    return (
      <div className="pf-options">
        <div className="pf-opt-group" style={{ borderRight: 0 }}>
          <span className="pf-opt-label" style={{ marginRight: 0 }}>
            {t('pages.imageEditor.eyedropperHint')}
          </span>
        </div>
      </div>
    )
  }

  if (tool === 'text') {
    return (
      <div className="pf-options">
        <div className="pf-opt-group">
          <span className="pf-opt-label">{t('pages.imageEditor.color')}:</span>
          <input
            type="color"
            value={fgColor}
            onChange={(e) => setFgColor(e.target.value)}
            style={{
              width: 22,
              height: 22,
              padding: 0,
              border: '1px solid var(--pf-line)',
              background: 'transparent',
              borderRadius: 3,
              cursor: 'pointer',
            }}
          />
        </div>
        <div className="pf-opt-group" style={{ borderRight: 0 }}>
          <span className="pf-opt-label" style={{ marginRight: 0 }}>
            {t('pages.imageEditor.textToolHint')}
          </span>
        </div>
      </div>
    )
  }

  if (tool === 'hand') {
    return (
      <div className="pf-options">
        <div className="pf-opt-group" style={{ borderRight: 0 }}>
          <span className="pf-opt-label" style={{ marginRight: 0 }}>
            {t('pages.imageEditor.handHint')}
          </span>
        </div>
      </div>
    )
  }

  if (tool === 'note') {
    return (
      <div className="pf-options">
        <div className="pf-opt-group" style={{ borderRight: 0 }}>
          <span className="pf-opt-label" style={{ marginRight: 0 }}>
            {t('pages.imageEditor.noteHint')}
          </span>
        </div>
      </div>
    )
  }

  if (tool === 'frame') {
    return (
      <div className="pf-options">
        <div className="pf-opt-group" style={{ borderRight: 0 }}>
          <span className="pf-opt-label" style={{ marginRight: 0 }}>
            {t('pages.imageEditor.frameHint')}
          </span>
        </div>
      </div>
    )
  }

  if (tool === 'arrowPath') {
    return (
      <div className="pf-options">
        <div className="pf-opt-group" style={{ borderRight: 0 }}>
          <span className="pf-opt-label" style={{ marginRight: 0 }}>
            {t('pages.imageEditor.arrowPathHint')}
          </span>
        </div>
      </div>
    )
  }

  if (tool === 'mask' || tool === 'mosaic' || tool === 'blur') {
    return (
      <div className="pf-options">
        <div className="pf-opt-group" style={{ borderRight: 0 }}>
          <span className="pf-opt-label" style={{ marginRight: 0 }}>
            {tool === 'blur'
              ? t('pages.imageEditor.blurHint')
              : t('pages.imageEditor.toolHint', {
                  tool: t(`pages.imageEditor.tool.${tool}`),
                })}
          </span>
        </div>
      </div>
    )
  }

  // Move / select (none)
  return (
    <div className="pf-options">
      <div className="pf-opt-group" style={{ borderRight: 0 }}>
        <span className="pf-opt-label" style={{ marginRight: 0 }}>
          {t('pages.imageEditor.moveToolHint')}
        </span>
      </div>
    </div>
  )
}
