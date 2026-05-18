import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Aperture,
  ArrowRight,
  Brush,
  Circle,
  Crop,
  Droplet,
  Eraser,
  Frame,
  Hand,
  Lasso,
  LayoutTemplate,
  Moon,
  MousePointer,
  MousePointer2,
  PaintBucket,
  PenTool,
  Pipette,
  RefreshCw,
  RotateCw,
  Ruler,
  ScanLine,
  Search,
  Spline,
  Square,
  SquareDashed,
  Squircle,
  StickyNote,
  Sun,
  Type,
  Wand2,
} from 'lucide-react'
import type { Tool } from '@/lib/image-editor/types'

type ToolDef = {
  id: Tool
  icon: ReactNode
  labelKey: string
  shortcut?: string
  /** True = render but not yet implemented; click shows a "coming soon" toast. */
  stub?: boolean
}

/**
 * Vertical tool rail. Tools are grouped by function with thin separators
 * mirroring PS's left-rail organization. Functional tools have full
 * behavior; stub tools render the icon + tooltip but call `onStubClick` to
 * surface a "not yet implemented" message instead of silently swapping the
 * tool to a no-op state.
 */
const GROUPS: ToolDef[][] = [
  // 1. Selection / move group
  [
    { id: 'none', icon: <MousePointer2 className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.none', shortcut: 'V' },
    {
      id: 'marquee',
      icon: <SquareDashed className="h-4 w-4" />,
      labelKey: 'pages.imageEditor.tool.marquee',
      shortcut: 'M',
    },
    {
      id: 'lasso',
      icon: <Lasso className="h-4 w-4" />,
      labelKey: 'pages.imageEditor.tool.lasso',
      shortcut: 'L',
    },
    {
      id: 'polyLasso',
      icon: <PenTool className="h-4 w-4" />,
      labelKey: 'pages.imageEditor.tool.polyLasso',
    },
    {
      id: 'wand',
      icon: <Wand2 className="h-4 w-4" />,
      labelKey: 'pages.imageEditor.tool.wand',
      shortcut: 'W',
    },
    { id: 'crop', icon: <Crop className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.crop', shortcut: 'C' },
    {
      id: 'eyedropper',
      icon: <Pipette className="h-4 w-4" />,
      labelKey: 'pages.imageEditor.tool.eyedropper',
      shortcut: 'I',
    },
  ],
  // 2. Painting group
  [
    {
      id: 'spotHeal',
      icon: <Droplet className="h-4 w-4" />,
      labelKey: 'pages.imageEditor.tool.spotHeal',
      shortcut: 'J',
    },
    { id: 'brush', icon: <Brush className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.brush', shortcut: 'B' },
    {
      id: 'stamp',
      icon: <Ruler className="h-4 w-4" />,
      labelKey: 'pages.imageEditor.tool.stamp',
      shortcut: 'S',
    },
    {
      id: 'historyBrush',
      icon: <RotateCw className="h-4 w-4" />,
      labelKey: 'pages.imageEditor.tool.historyBrush',
      shortcut: 'Y',
    },
    { id: 'eraser', icon: <Eraser className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.eraser', shortcut: 'E' },
    {
      id: 'gradient',
      icon: <ScanLine className="h-4 w-4" />,
      labelKey: 'pages.imageEditor.tool.gradient',
      shortcut: 'G',
    },
    {
      id: 'bucket',
      icon: <PaintBucket className="h-4 w-4" />,
      labelKey: 'pages.imageEditor.tool.bucket',
      shortcut: 'G',
    },
    {
      id: 'dodge',
      icon: <Sun className="h-4 w-4" />,
      labelKey: 'pages.imageEditor.tool.dodge',
      shortcut: 'O',
    },
    {
      id: 'burn',
      icon: <Moon className="h-4 w-4" />,
      labelKey: 'pages.imageEditor.tool.burn',
    },
  ],
  // 3. Vector / type group
  [
    {
      id: 'pen',
      icon: <PenTool className="h-4 w-4" />,
      labelKey: 'pages.imageEditor.tool.pen',
      shortcut: 'P',
    },
    {
      id: 'arrowPath',
      icon: <MousePointer className="h-4 w-4" />,
      labelKey: 'pages.imageEditor.tool.arrowPath',
      shortcut: 'A',
    },
    { id: 'text', icon: <Type className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.text', shortcut: 'T' },
    { id: 'rect', icon: <Square className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.rect', shortcut: 'U' },
    { id: 'ellipse', icon: <Circle className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.ellipse', shortcut: 'U' },
    {
      id: 'line',
      icon: <Spline className="h-4 w-4" />,
      labelKey: 'pages.imageEditor.tool.line',
      shortcut: 'U',
    },
    {
      id: 'arrow',
      icon: <ArrowRight className="h-4 w-4" />,
      labelKey: 'pages.imageEditor.tool.arrow',
    },
  ],
  // 4. Annotation / mask
  [
    { id: 'mask', icon: <Frame className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.mask' },
    {
      id: 'frame',
      icon: <LayoutTemplate className="h-4 w-4" />,
      labelKey: 'pages.imageEditor.tool.frame',
    },
    {
      id: 'note',
      icon: <StickyNote className="h-4 w-4" />,
      labelKey: 'pages.imageEditor.tool.note',
    },
    { id: 'mosaic', icon: <Squircle className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.mosaic' },
    { id: 'blur', icon: <Aperture className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.blur' },
  ],
  // 5. Navigation
  [
    {
      id: 'hand',
      icon: <Hand className="h-4 w-4" />,
      labelKey: 'pages.imageEditor.tool.hand',
      shortcut: 'H',
    },
    {
      id: 'rotateView',
      icon: <RefreshCw className="h-4 w-4" />,
      labelKey: 'pages.imageEditor.tool.rotateView',
      shortcut: 'R',
    },
    { id: 'zoom', icon: <Search className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.zoom', shortcut: 'Z' },
  ],
]

// (STUB_TOOLS lives in `./tool-meta.ts` — keeping non-component exports out of
// this file so react-refresh stays happy.)

type Props = {
  tool: Tool
  setTool: (t: Tool) => void
  fgColor: string
  bgColor: string
  setFgColor: (c: string) => void
  setBgColor: (c: string) => void
  swapColors: () => void
  resetColors: () => void
  onStubClick: (toolName: string) => void
  /** Click on FG / BG swatch opens the PS-style ColorPickerDialog. The
   *  native <input type=color> path stays as a hidden fallback (clicking
   *  the label still focuses the input — relevant for users / OSes that
   *  prefer the native picker). */
  onOpenColorPicker?: (which: 'fg' | 'bg') => void
}

export function ToolsPalette({
  tool,
  setTool,
  fgColor,
  bgColor,
  setFgColor,
  setBgColor,
  swapColors,
  resetColors,
  onStubClick,
  onOpenColorPicker,
}: Props) {
  const { t } = useTranslation()
  return (
    <div className="pf-tools">
      {GROUPS.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && <div className="pf-tool-sep" />}
          {group.map((td) => {
            const active = !td.stub && tool === td.id
            return (
              <div
                key={td.id}
                className={`pf-tool-btn ${active ? 'pf-active' : ''} ${td.stub ? 'pf-stub' : ''}`}
                title={td.shortcut ? `${t(td.labelKey)} (${td.shortcut})` : t(td.labelKey)}
                onClick={() => {
                  if (td.stub) onStubClick(t(td.labelKey))
                  else setTool(active ? 'none' : td.id)
                }}
              >
                {td.icon}
              </div>
            )
          })}
        </div>
      ))}

      <div style={{ flex: 1 }} />

      <div className="pf-tool-sep" />
      <div
        className="pf-tool-colors"
        title={`${t('pages.imageEditor.colors')} — X/D`}
      >
        {onOpenColorPicker ? (
          <>
            <button
              type="button"
              className="pf-bg"
              style={{ backgroundColor: bgColor, border: 'none', cursor: 'pointer' }}
              onClick={() => onOpenColorPicker('bg')}
              title={t('pages.imageEditor.bgColor')}
            />
            <button
              type="button"
              className="pf-fg"
              style={{ backgroundColor: fgColor, border: 'none', cursor: 'pointer' }}
              onClick={() => onOpenColorPicker('fg')}
              title={t('pages.imageEditor.fgColor')}
            />
          </>
        ) : (
          <>
            <label className="pf-bg" style={{ backgroundColor: bgColor }} title={t('pages.imageEditor.bgColor')}>
              <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
            </label>
            <label className="pf-fg" style={{ backgroundColor: fgColor }} title={t('pages.imageEditor.fgColor')}>
              <input type="color" value={fgColor} onChange={(e) => setFgColor(e.target.value)} />
            </label>
          </>
        )}
      </div>
      <div
        className="pf-tool-mode"
        title={`${t('pages.imageEditor.swapColors')} (X)`}
        onClick={swapColors}
        style={{ fontSize: 11 }}
      >
        ⇄
      </div>
      <div
        className="pf-tool-mode"
        title={`${t('pages.imageEditor.resetColors')} (D)`}
        onClick={resetColors}
        style={{ fontSize: 11 }}
      >
        ▣
      </div>
    </div>
  )
}
