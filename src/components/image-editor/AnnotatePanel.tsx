import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  Brush,
  Crop,
  Eraser,
  Square,
  Squircle,
  Type,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from './Slider'
import { ToolButton } from './ToolButton'
import type { Tool } from '@/lib/image-editor/types'

type Props = {
  tool: Tool
  setTool: (t: Tool) => void
  color: string
  setColor: (c: string) => void
  strokeWidth: number
  setStrokeWidth: (n: number) => void
}

export function AnnotatePanel({
  tool,
  setTool,
  color,
  setColor,
  strokeWidth,
  setStrokeWidth,
}: Props) {
  const { t } = useTranslation()
  const flip = (next: Tool) => setTool(tool === next ? 'none' : next)
  return (
    <div className="space-y-5">
      <Section title={t('pages.imageEditor.tool.title')}>
        <div className="grid grid-cols-2 gap-2">
          <ToolButton
            active={tool === 'rect'}
            onClick={() => flip('rect')}
            icon={<Square className="h-4 w-4" />}
            label={t('pages.imageEditor.tool.rect')}
          />
          <ToolButton
            active={tool === 'arrow'}
            onClick={() => flip('arrow')}
            icon={<ArrowRight className="h-4 w-4" />}
            label={t('pages.imageEditor.tool.arrow')}
          />
          <ToolButton
            active={tool === 'text'}
            onClick={() => flip('text')}
            icon={<Type className="h-4 w-4" />}
            label={t('pages.imageEditor.tool.text')}
          />
          <ToolButton
            active={tool === 'mosaic'}
            onClick={() => flip('mosaic')}
            icon={<Squircle className="h-4 w-4" />}
            label={t('pages.imageEditor.tool.mosaic')}
          />
          <ToolButton
            active={tool === 'brush'}
            onClick={() => flip('brush')}
            icon={<Brush className="h-4 w-4" />}
            label={t('pages.imageEditor.tool.brush')}
          />
          <ToolButton
            active={tool === 'eraser'}
            onClick={() => flip('eraser')}
            icon={<Eraser className="h-4 w-4" />}
            label={t('pages.imageEditor.tool.eraser')}
          />
          <ToolButton
            active={tool === 'mask'}
            onClick={() => flip('mask')}
            icon={<Crop className="h-4 w-4" />}
            label={t('pages.imageEditor.tool.mask')}
          />
        </div>
      </Section>

      <Section title={t('pages.imageEditor.style')}>
        <div className="flex items-center gap-3">
          <Label className="w-16 text-xs text-muted-foreground">
            {t('pages.imageEditor.color')}
          </Label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-16 cursor-pointer rounded border border-border bg-transparent"
          />
          <Input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
        <Slider
          label={t('pages.imageEditor.strokeWidth')}
          value={strokeWidth}
          min={1}
          max={40}
          unit="px"
          onChange={setStrokeWidth}
        />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground/70">{title}</Label>
      {children}
    </div>
  )
}
