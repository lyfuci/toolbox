import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  formatHsl,
  formatRgb,
  hslToRgb,
  parseHex,
  parseHsl,
  parseRgb,
  rgbToHex,
  rgbToHsl,
  type RGB,
} from '@/lib/color'

const SAMPLE: RGB = { r: 88, g: 130, b: 246 }

export function ColorPage() {
  const { t } = useTranslation()
  const [rgb, setRgb] = useState<RGB>(SAMPLE)

  const hex = rgbToHex(rgb)
  const rgbStr = formatRgb(rgb)
  const hslStr = formatHsl(rgbToHsl(rgb))

  const updateFromHex = (s: string) => {
    const parsed = parseHex(s)
    if (parsed) setRgb(parsed)
  }
  const updateFromRgb = (s: string) => {
    const parsed = parseRgb(s)
    if (parsed) setRgb(parsed)
  }
  const updateFromHsl = (s: string) => {
    const parsed = parseHsl(s)
    if (parsed) setRgb(hslToRgb(parsed))
  }

  const handleCopy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value)
    toast.success(t('common.copiedLabel', { label }))
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.color.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.color.description')}</p>
      </header>

      <div className="mb-6 flex items-center gap-4">
        <div
          className="h-24 w-24 shrink-0 rounded-lg border border-border shadow-sm"
          style={{ backgroundColor: hex }}
          aria-label="color preview"
        />
        <input
          type="color"
          value={hex}
          onChange={(e) => updateFromHex(e.target.value)}
          className="h-24 w-24 cursor-pointer rounded-lg border border-border bg-transparent"
        />
      </div>

      <div className="flex flex-col gap-3">
        {[
          { label: 'HEX', value: hex, onChange: updateFromHex },
          { label: 'RGB', value: rgbStr, onChange: updateFromRgb },
          { label: 'HSL', value: hslStr, onChange: updateFromHsl },
        ].map(({ label, value, onChange }) => (
          <div key={label} className="flex items-center gap-3">
            <Label className="w-12 shrink-0 text-xs font-medium text-muted-foreground">
              {label}
            </Label>
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              spellCheck={false}
              className="font-mono text-sm"
            />
            <Button size="sm" variant="ghost" onClick={() => handleCopy(label, value)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
