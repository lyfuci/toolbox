import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Minimize2, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

const SAMPLE = `{"name":"toolbox","version":1,"tools":["json","jwt","media"],"meta":{"local":true}}`

type ParseState =
  | { ok: true; value: unknown }
  | { ok: false; error: string }

function parse(input: string, emptyMsg: string): ParseState {
  if (!input.trim()) return { ok: false, error: emptyMsg }
  try {
    return { ok: true, value: JSON.parse(input) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function JsonPage() {
  const { t } = useTranslation()
  const [input, setInput] = useState(SAMPLE)
  const [indent, setIndent] = useState<2 | 4>(2)

  const state = useMemo(() => parse(input, t('common.emptyInput')), [input, t])

  const formatted = state.ok ? JSON.stringify(state.value, null, indent) : ''
  const minified = state.ok ? JSON.stringify(state.value) : ''

  const handleFormat = () => {
    if (!state.ok) return toast.error(t('common.parseFailed', { error: state.error }))
    setInput(formatted)
  }
  const handleMinify = () => {
    if (!state.ok) return toast.error(t('common.parseFailed', { error: state.error }))
    setInput(minified)
  }
  const handleCopy = async () => {
    if (!input) return
    await navigator.clipboard.writeText(input)
    toast.success(t('common.copied'))
  }
  const handleClear = () => setInput('')

  const stats = state.ok
    ? t('pages.json.stats', {
        chars: input.length.toLocaleString(),
        minified: minified.length.toLocaleString(),
      })
    : null

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.json.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.json.description')}</p>
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
            {t('pages.json.indent')}
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
        placeholder={t('pages.json.placeholder')}
      />

      <div className="mt-3 flex items-center justify-between text-xs">
        {state.ok ? (
          <span className="text-muted-foreground">{stats}</span>
        ) : (
          <span className="text-destructive">⚠ {state.error}</span>
        )}
      </div>
    </div>
  )
}
