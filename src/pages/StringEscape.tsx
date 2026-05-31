import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, ArrowRightLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { transform, ESCAPE_MODES, type EscapeMode, type Direction } from '@/lib/string-escape'

export function StringEscapePage() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<EscapeMode>('json')
  const [direction, setDirection] = useState<Direction>('escape')
  const [input, setInput] = useState('Hello, "world"\n<tag> & café 😀')

  const result = useMemo(() => {
    if (!input) return { ok: true as const, value: '' }
    try {
      return { ok: true as const, value: transform(input, mode, direction) }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  }, [input, mode, direction])

  const copy = async () => {
    if (!result.ok || !result.value) return
    await navigator.clipboard.writeText(result.value)
    toast.success(t('pages.escape.copied'))
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.escape.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.escape.description')}</p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-input bg-transparent text-sm">
          {ESCAPE_MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 transition-colors ${
                mode === m
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(`pages.escape.modes.${m}`)}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border border-input bg-transparent text-sm">
            {(['escape', 'unescape'] as Direction[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={`px-3 py-1.5 transition-colors ${
                  direction === d
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(`pages.escape.${d}`)}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDirection((d) => (d === 'escape' ? 'unescape' : 'escape'))}
            title={t('pages.escape.swap')}
          >
            <ArrowRightLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            {t('pages.escape.inputLabel')}
          </Label>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            className="min-h-[260px] font-mono text-sm"
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">{t('pages.escape.outputLabel')}</Label>
            <Button size="sm" variant="ghost" onClick={copy} disabled={!result.ok || !result.value}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          {result.ok ? (
            <Textarea
              value={result.value}
              readOnly
              spellCheck={false}
              className="min-h-[260px] font-mono text-sm"
            />
          ) : (
            <div className="flex min-h-[260px] items-start rounded-md border border-destructive/40 p-3 text-sm text-destructive">
              ⚠ {result.error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
