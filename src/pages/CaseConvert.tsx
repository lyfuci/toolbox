import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

const SAMPLE = 'helloWorld toolbox-app FOO_BAR'

// Split into "words" by treating any of: whitespace, _, -, . as a delimiter,
// AND inserting a delimiter at every camelCase / PascalCase boundary.
function splitWords(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-.]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean)
}

type ConversionKey =
  | 'lower'
  | 'upper'
  | 'title'
  | 'sentence'
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'constant'
  | 'kebab'
  | 'dot'

const CONVERSIONS: { key: ConversionKey; fn: (input: string) => string }[] = [
  { key: 'lower', fn: (s) => s.toLowerCase() },
  { key: 'upper', fn: (s) => s.toUpperCase() },
  {
    key: 'title',
    fn: (s) => splitWords(s).map((w) => w[0].toUpperCase() + w.slice(1)).join(' '),
  },
  { key: 'sentence', fn: (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() },
  {
    key: 'camel',
    fn: (s) => {
      const ws = splitWords(s)
      if (ws.length === 0) return ''
      return ws[0] + ws.slice(1).map((w) => w[0].toUpperCase() + w.slice(1)).join('')
    },
  },
  {
    key: 'pascal',
    fn: (s) => splitWords(s).map((w) => w[0].toUpperCase() + w.slice(1)).join(''),
  },
  { key: 'snake', fn: (s) => splitWords(s).join('_') },
  { key: 'constant', fn: (s) => splitWords(s).join('_').toUpperCase() },
  { key: 'kebab', fn: (s) => splitWords(s).join('-') },
  { key: 'dot', fn: (s) => splitWords(s).join('.') },
]

export function CaseConvertPage() {
  const { t } = useTranslation()
  const [input, setInput] = useState(SAMPLE)

  const rows = useMemo(
    () => CONVERSIONS.map(({ key, fn }) => ({ key, value: fn(input) })),
    [input],
  )

  const handleCopy = async (label: string, v: string) => {
    await navigator.clipboard.writeText(v)
    toast.success(t('common.copiedLabel', { label }))
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.case.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.case.description')}</p>
      </header>

      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        spellCheck={false}
        className="mb-6 min-h-[120px] font-mono text-sm leading-relaxed"
        placeholder={t('pages.case.placeholder')}
      />

      <div className="flex flex-col gap-2">
        {rows.map(({ key, value }) => {
          const name = t(`pages.case.${key}`)
          return (
            <div
              key={key}
              className="flex items-center gap-3 rounded-md border border-border bg-card/40 px-3 py-2"
            >
              <span className="w-36 shrink-0 text-xs font-medium text-muted-foreground">
                {name}
              </span>
              <code className="flex-1 truncate font-mono text-sm">{value}</code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleCopy(name, value)}
                disabled={!value}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
