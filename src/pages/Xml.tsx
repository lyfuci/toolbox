import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Minimize2, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { formatXml, minifyXml } from '@/lib/xml'

const SAMPLE = `<?xml version="1.0"?><root><item id="1">first</item><item id="2"><nested>value</nested></item></root>`

export function XmlPage() {
  const { t } = useTranslation()
  const [input, setInput] = useState(SAMPLE)
  const [indent, setIndent] = useState<2 | 4>(2)

  const formatted = useMemo(() => {
    if (!input.trim()) return { ok: true as const, value: '' }
    try {
      return { ok: true as const, value: formatXml(input, indent) }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  }, [input, indent])

  const handleFormat = () => {
    if (!formatted.ok) return toast.error(t('common.parseFailed', { error: formatted.error }))
    setInput(formatted.value)
  }
  const handleMinify = () => {
    try {
      setInput(minifyXml(input))
    } catch (err) {
      toast.error(
        t('common.parseFailed', {
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    }
  }
  const handleCopy = async () => {
    if (!input) return
    await navigator.clipboard.writeText(input)
    toast.success(t('common.copied'))
  }
  const handleClear = () => setInput('')

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.xml.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.xml.description')}</p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={handleFormat}>
          <Sparkles className="h-4 w-4" />
          {t('common.format')}
        </Button>
        <Button size="sm" variant="secondary" onClick={handleMinify}>
          <Minimize2 className="h-4 w-4" />
          {t('common.minify')}
        </Button>
        <Button size="sm" variant="secondary" onClick={handleCopy}>
          <Copy className="h-4 w-4" />
          {t('common.copy')}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleClear}>
          <Trash2 className="h-4 w-4" />
          {t('common.clear')}
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <Label htmlFor="indent" className="text-xs text-muted-foreground">
            {t('pages.xml.indent')}
          </Label>
          <div className="flex rounded-md border border-input bg-transparent text-sm">
            {[2, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setIndent(n as 2 | 4)}
                className={`px-3 py-1 transition-colors ${
                  indent === n
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        spellCheck={false}
        className="min-h-[420px] font-mono text-sm leading-relaxed"
        placeholder={t('pages.xml.placeholder')}
      />

      <div className="mt-3 text-xs">
        {formatted.ok ? (
          <span className="text-muted-foreground">
            {t('pages.xml.stats', { chars: input.length.toLocaleString() })}
          </span>
        ) : (
          <span className="text-destructive">⚠ {formatted.error}</span>
        )}
      </div>
    </div>
  )
}
