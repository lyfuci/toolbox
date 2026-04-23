import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  Brush,
  Crop,
  Eraser,
  MousePointer2,
  Square,
  Squircle,
  Type,
} from 'lucide-react'
import type { Tool } from '@/lib/image-editor/types'

const TOOLS: { tool: Tool; icon: ReactNode; labelKey: string }[] = [
  { tool: 'none', icon: <MousePointer2 className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.none' },
  { tool: 'rect', icon: <Square className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.rect' },
  { tool: 'arrow', icon: <ArrowRight className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.arrow' },
  { tool: 'text', icon: <Type className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.text' },
  { tool: 'mosaic', icon: <Squircle className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.mosaic' },
  { tool: 'brush', icon: <Brush className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.brush' },
  { tool: 'eraser', icon: <Eraser className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.eraser' },
  { tool: 'mask', icon: <Crop className="h-4 w-4" />, labelKey: 'pages.imageEditor.tool.mask' },
]

type Props = {
  tool: Tool
  setTool: (t: Tool) => void
  color: string
  setColor: (c: string) => void
  strokeWidth: number
  setStrokeWidth: (n: number) => void
}

/**
 * Vertical PS-style tools palette: each tool is a 36px icon button.
 * Below the tools, the current color swatch (opens native color picker)
 * and the stroke-width control. Visually narrow (~64px wide).
 */
export function ToolsPalette({
  tool,
  setTool,
  color,
  setColor,
  strokeWidth,
  setStrokeWidth,
}: Props) {
  const { t } = useTranslation()
  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-card/40 py-3">
      {TOOLS.map(({ tool: tToolKey, icon, labelKey }) => {
        const active = tool === tToolKey
        return (
          <button
            key={tToolKey}
            type="button"
            onClick={() => setTool(active ? 'none' : tToolKey)}
            title={t(labelKey)}
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

      {/* Color swatch — uses native color picker */}
      <label
        title={t('pages.imageEditor.color')}
        className="relative h-9 w-9 cursor-pointer overflow-hidden rounded border border-border"
        style={{ backgroundColor: color }}
      >
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>

      {/* Stroke width — vertical compact slider */}
      <div className="mt-2 flex flex-col items-center gap-1">
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
