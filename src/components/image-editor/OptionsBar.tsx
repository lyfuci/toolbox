import { useTranslation } from 'react-i18next'
import type { BrushOptions, FontStyle, FontWeight, TextAlign, TextOptions, Tool } from '@/lib/image-editor/types'

/** Curated web-safe font families. Browsers fall back per the CSS spec
 *  if a family isn't installed. Adding custom @font-face declarations is
 *  a follow-up; the curated list keeps the dropdown short and predictable. */
const FONT_FAMILIES = [
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'system-ui',
  'Helvetica',
  'Arial',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Impact',
]

type Props = {
  tool: Tool
  fgColor: string
  setFgColor: (c: string) => void
  bgColor: string
  setBgColor: (c: string) => void
  strokeWidth: number
  setStrokeWidth: (n: number) => void
  brushOptions: BrushOptions
  setBrushOptions: (b: BrushOptions) => void
  textOptions: TextOptions
  setTextOptions: (t: TextOptions) => void
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
  brushOptions,
  setBrushOptions,
  textOptions,
  setTextOptions,
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

  // Brush / eraser / dodge / burn — stroke width + color (brush only) +
  // hardness/spacing/flow/opacity sliders. Dodge/burn hide opacity (they keep
  // a hardcoded exposure to preserve the subtle build-up feel).
  if (tool === 'brush' || tool === 'eraser' || tool === 'dodge' || tool === 'burn') {
    const showOpacity = tool === 'brush' || tool === 'eraser'
    const setOpt = (patch: Partial<BrushOptions>) =>
      setBrushOptions({ ...brushOptions, ...patch })
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
        <PercentSlider
          label={t('pages.imageEditor.brushHardness')}
          value={brushOptions.hardness}
          onChange={(v) => setOpt({ hardness: v })}
        />
        <PercentSlider
          label={t('pages.imageEditor.brushSpacing')}
          value={brushOptions.spacing}
          onChange={(v) => setOpt({ spacing: v })}
        />
        <PercentSlider
          label={t('pages.imageEditor.brushFlow')}
          value={brushOptions.flow}
          onChange={(v) => setOpt({ flow: v })}
        />
        {showOpacity && (
          <PercentSlider
            label={t('pages.imageEditor.brushOpacity')}
            value={brushOptions.opacity}
            onChange={(v) => setOpt({ opacity: v })}
          />
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
    const setOpt = (patch: Partial<TextOptions>) =>
      setTextOptions({ ...textOptions, ...patch })
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
        <div className="pf-opt-group">
          <select
            value={textOptions.fontFamily}
            onChange={(e) => setOpt({ fontFamily: e.target.value })}
            className="h-6 rounded border border-input bg-background px-1 text-xs"
            title={t('pages.imageEditor.text.fontFamily')}
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={6}
            max={400}
            value={textOptions.fontSize}
            onChange={(e) => setOpt({ fontSize: Math.max(1, Number(e.target.value) || 1) })}
            className="h-6 w-14 rounded border border-input bg-background px-1 text-xs"
            title={t('pages.imageEditor.text.fontSize')}
          />
        </div>
        <div className="pf-opt-group">
          <button
            onClick={() =>
              setOpt({
                fontWeight: (textOptions.fontWeight === 'bold' ? 'normal' : 'bold') as FontWeight,
              })
            }
            className={`pf-opt-btn ${textOptions.fontWeight === 'bold' ? 'pf-active' : ''}`}
            style={{ fontWeight: 'bold' }}
            title={t('pages.imageEditor.text.bold')}
          >
            B
          </button>
          <button
            onClick={() =>
              setOpt({
                fontStyle: (textOptions.fontStyle === 'italic'
                  ? 'normal'
                  : 'italic') as FontStyle,
              })
            }
            className={`pf-opt-btn ${textOptions.fontStyle === 'italic' ? 'pf-active' : ''}`}
            style={{ fontStyle: 'italic' }}
            title={t('pages.imageEditor.text.italic')}
          >
            I
          </button>
          <button
            onClick={() => setOpt({ underline: !textOptions.underline })}
            className={`pf-opt-btn ${textOptions.underline ? 'pf-active' : ''}`}
            style={{ textDecoration: 'underline' }}
            title={t('pages.imageEditor.text.underline')}
          >
            U
          </button>
        </div>
        <div className="pf-opt-group">
          {(['left', 'center', 'right'] as TextAlign[]).map((a) => (
            <button
              key={a}
              onClick={() => setOpt({ align: a })}
              className={`pf-opt-btn ${textOptions.align === a ? 'pf-active' : ''}`}
              title={t(`pages.imageEditor.text.align${a[0].toUpperCase() + a.slice(1)}`)}
            >
              {a === 'left' ? '⫷' : a === 'center' ? '☰' : '⫸'}
            </button>
          ))}
        </div>
        <div className="pf-opt-group" style={{ borderRight: 0 }}>
          <span className="pf-opt-label">{t('pages.imageEditor.text.lineHeight')}:</span>
          <input
            type="number"
            min={0.5}
            max={4}
            step={0.1}
            value={textOptions.lineHeight}
            onChange={(e) => setOpt({ lineHeight: Math.max(0.1, Number(e.target.value) || 1.2) })}
            className="h-6 w-14 rounded border border-input bg-background px-1 text-xs"
          />
          <span className="pf-opt-label">{t('pages.imageEditor.text.tracking')}:</span>
          <input
            type="number"
            min={-20}
            max={50}
            value={textOptions.letterSpacing}
            onChange={(e) => setOpt({ letterSpacing: Number(e.target.value) || 0 })}
            className="h-6 w-14 rounded border border-input bg-background px-1 text-xs"
          />
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

  if (tool === 'pen') {
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
        <div className="pf-opt-group" style={{ borderRight: 0 }}>
          <span className="pf-opt-label" style={{ marginRight: 0 }}>
            {t('pages.imageEditor.penHint')}
          </span>
        </div>
      </div>
    )
  }

  // Sample-pixel tools (Spot Heal / Clone Stamp / History Brush) — drag-paint,
  // share the same brush-options surface as Brush + a tool-specific hint.
  if (tool === 'spotHeal' || tool === 'stamp' || tool === 'historyBrush') {
    const hintKey =
      tool === 'spotHeal'
        ? 'pages.imageEditor.spotHealHint'
        : tool === 'stamp'
          ? 'pages.imageEditor.cloneStampHint'
          : 'pages.imageEditor.historyBrushHint'
    const setOpt = (patch: Partial<BrushOptions>) =>
      setBrushOptions({ ...brushOptions, ...patch })
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
        <PercentSlider
          label={t('pages.imageEditor.brushHardness')}
          value={brushOptions.hardness}
          onChange={(v) => setOpt({ hardness: v })}
        />
        <PercentSlider
          label={t('pages.imageEditor.brushSpacing')}
          value={brushOptions.spacing}
          onChange={(v) => setOpt({ spacing: v })}
        />
        <PercentSlider
          label={t('pages.imageEditor.brushFlow')}
          value={brushOptions.flow}
          onChange={(v) => setOpt({ flow: v })}
        />
        <PercentSlider
          label={t('pages.imageEditor.brushOpacity')}
          value={brushOptions.opacity}
          onChange={(v) => setOpt({ opacity: v })}
        />
        <div className="pf-opt-group" style={{ borderRight: 0 }}>
          <span className="pf-opt-label" style={{ marginRight: 0 }}>
            {t(hintKey)}
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

/**
 * Compact "label + range slider + percent number" combo for brush options. The
 * range maps 0..100 to the underlying 0..1 value so the user sees integer
 * percents in the UI.
 */
function PercentSlider(props: {
  label: string
  value: number // 0..1
  onChange: (v: number) => void
}) {
  const pct = Math.round(props.value * 100)
  const set = (n: number) => props.onChange(Math.min(1, Math.max(0, n / 100)))
  return (
    <div className="pf-opt-group">
      <span className="pf-opt-label">{props.label}:</span>
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        onChange={(e) => set(Number(e.target.value))}
        style={{ width: 80, accentColor: 'var(--pf-accent)' }}
      />
      <span className="pf-opt-label" style={{ marginLeft: 6, marginRight: 0, minWidth: 28, textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  )
}
