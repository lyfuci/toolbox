import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  Brush,
  Crop,
  Eraser,
  Frame,
  MousePointer2,
  Pipette,
  RotateCcw,
  Search,
  Square,
  Squircle,
  Type,
} from 'lucide-react'
import type { Tool } from '@/lib/image-editor/types'

const TOOLS: { tool: Tool; icon: ReactNode; labelKey: string; key?: string }[] = [
  { tool: 'none', icon: <MousePointer2 className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.none', key: 'V' },
  { tool: 'rect', icon: <Square className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.rect', key: 'M' },
  { tool: 'arrow', icon: <ArrowRight className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.arrow', key: 'A' },
  { tool: 'text', icon: <Type className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.text', key: 'T' },
  { tool: 'mosaic', icon: <Squircle className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.mosaic' },
  { tool: 'brush', icon: <Brush className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.brush', key: 'B' },
  { tool: 'eraser', icon: <Eraser className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.eraser', key: 'E' },
  { tool: 'mask', icon: <Frame className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.mask' },
  { tool: 'crop', icon: <Crop className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.crop', key: 'C' },
  { tool: 'eyedropper', icon: <Pipette className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.eyedropper', key: 'I' },
  { tool: 'zoom', icon: <Search className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.zoom', key: 'Z' },
]

type Props = {
  tool: Tool
  setTool: (t: Tool) => void
  fgColor: string
  bgColor: string
  setFgColor: (c: string) => void
  setBgColor: (c: string) => void
  swapColors: () => void
  resetColors: () => void
  strokeWidth: number
  setStrokeWidth: (n: number) => void
}

/**
 * Vertical PS-style tools palette: each tool is a 36px icon button.
 * Below the tools: foreground/background color squares (PS-classic
 * stacked layout — fg in front, bg behind), with X (swap) and D
 * (reset to black/white) icon buttons. Then a stroke-width slider.
 */
export function ToolsPalette({
  tool,
  setTool,
  fgColor,
  bgColor,
  setFgColor,
  setBgColor,
  swapColors,
  resetColors,
  strokeWidth,
  setStrokeWidth,
}: Props) {
  const { t } = useTranslation()
  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-card/40 py-3">
      {TOOLS.map(({ tool: tToolKey, icon, labelKey, key }) => {
        const active = tool === tToolKey
        return (
          <button
            key={tToolKey}
            type="button"
            onClick={() => setTool(active ? 'none' : tToolKey)}
            title={key ? `${t(labelKey)} (${key})` : t(labelKey)}
            className={`flex h-9 w-9 items-center justify-center rounded transition-colors ${
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
            }`}
          >
            {icon}
          </button>
        )
      })}

      <div className="my-2 h-px w-8 bg-border" />

      {/* PS-classic dual color swatch: bg in back, fg in front, slightly offset. */}
      <div className="relative h-10 w-10" title={t('pages.imageEditor.colors')}>
        <label
          title={t('pages.imageEditor.bgColor')}
          className="absolute right-0 bottom-0 h-7 w-7 cursor-pointer overflow-hidden rounded-sm border border-border shadow-sm"
          style={{ backgroundColor: bgColor }}
        >
          <input
            type="color"
            value={bgColor}
            onChange={(e) => setBgColor(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
        <label
          title={t('pages.imageEditor.fgColor')}
          className="absolute top-0 left-0 h-7 w-7 cursor-pointer overflow-hidden rounded-sm border border-border shadow-sm"
          style={{ backgroundColor: fgColor }}
        >
          <input
            type="color"
            value={fgColor}
            onChange={(e) => setFgColor(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={swapColors}
          title={`${t('pages.imageEditor.swapColors')} (X)`}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent/40 hover:text-foreground"
        >
          <ArrowRight className="h-3 w-3" style={{ transform: 'rotate(-45deg)' }} />
        </button>
        <button
          type="button"
          onClick={resetColors}
          title={`${t('pages.imageEditor.resetColors')} (D)`}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent/40 hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>

      <div className="my-2 h-px w-8 bg-border" />

      {/* Stroke width — vertical compact slider */}
      <div className="mt-1 flex flex-col items-center gap-1">
        <span className="text-[10px] text-muted-foreground" title={t('pages.imageEditor.strokeWidth')}>
          {strokeWidth}
        </span>
        <input
          type="range"
          min={1}
          max={40}
          value={strokeWidth}
          onChange={(e) => setStrokeWidth(Number(e.target.value))}
          title={t('pages.imageEditor.strokeWidth')}
          className="h-20 w-3 accent-primary"
          style={{ writingMode: 'vertical-lr' as unknown as undefined, direction: 'rtl' }}
        />
      </div>
    </div>
  )
}
