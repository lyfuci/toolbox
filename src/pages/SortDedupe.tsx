import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

type Sort = 'none' | 'asc' | 'desc'

const SAMPLE = `banana
apple
Cherry
apple
date
banana
elderberry
`

function process(input: string, opts: {
  sort: Sort
  dedupe: boolean
  trim: boolean
  ignoreCase: boolean
  removeBlank: boolean
}): string[] {
  let lines = input.split('\n')
  if (opts.trim) lines = lines.map((l) => l.trim())
  if (opts.removeBlank) lines = lines.filter((l) => l.length > 0)
  if (opts.dedupe) {
    const seen = new Set<string>()
    lines = lines.filter((l) => {
      const key = opts.ignoreCase ? l.toLowerCase() : l
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  if (opts.sort !== 'none') {
    const cmp = (a: string, b: string) => {
      const av = opts.ignoreCase ? a.toLowerCase() : a
      const bv = opts.ignoreCase ? b.toLowerCase() : b
      return av < bv ? -1 : av > bv ? 1 : 0
    }
    lines.sort(opts.sort === 'asc' ? cmp : (a, b) => -cmp(a, b))
  }
  return lines
}

export function SortDedupePage() {
  const { t } = useTranslation()
  const [input, setInput] = useState(SAMPLE)
  const [sort, setSort] = useState<Sort>('asc')
  const [dedupe, setDedupe] = useState(true)
  const [trim, setTrim] = useState(true)
  const [ignoreCase, setIgnoreCase] = useState(false)
  const [removeBlank, setRemoveBlank] = useState(true)

  const lines = useMemo(
    () => process(input, { sort, dedupe, trim, ignoreCase, removeBlank }),
    [input, sort, dedupe, trim, ignoreCase, removeBlank],
  )
  const output = lines.join('\n')

  const handleCopy = async () => {
    if (!output) return
    await navigator.clipboard.writeText(output)
    toast.success(t('common.copied'))
  }

  const inputLineCount = input.split('\n').length

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.sort-dedupe.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.sortDedupe.description')}</p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Label className="text-xs text-muted-foreground">{t('pages.sortDedupe.sort')}</Label>
        <div className="flex rounded-md border border-input bg-transparent text-sm">
          {(
            [
              ['none', t('pages.sortDedupe.noSort')],
              ['asc', t('pages.sortDedupe.asc')],
              ['desc', t('pages.sortDedupe.desc')],
            ] as [Sort, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setSort(v)}
              className={`px-3 py-1 transition-colors ${
                sort === v
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {[
          { label: t('pages.sortDedupe.dedupe'), state: dedupe, setter: setDedupe },
          { label: t('pages.sortDedupe.trim'), state: trim, setter: setTrim },
          { label: t('pages.sortDedupe.removeBlank'), state: removeBlank, setter: setRemoveBlank },
          { label: t('pages.sortDedupe.ignoreCase'), state: ignoreCase, setter: setIgnoreCase },
        ].map(({ label, state, setter }) => (
          <label
            key={label}
            className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none"
          >
            <input
              type="checkbox"
              checked={state}
              onChange={(e) => setter(e.target.checked)}
              className="accent-primary"
            />
            {label}
          </label>
        ))}

        <Button size="sm" variant="ghost" onClick={() => setInput('')} className="ml-auto">
          <Trash2 className="h-4 w-4" />
          {t('common.clear')}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            {t('common.input')} ({t('pages.sortDedupe.lineCount', { n: inputLineCount })})
          </Label>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            className="min-h-[360px] font-mono text-sm leading-relaxed"
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">
              {t('common.output')} ({t('pages.sortDedupe.lineCount', { n: lines.length })})
            </Label>
            <Button size="sm" variant="ghost" onClick={handleCopy} disabled={!output}>
              <Copy className="h-3.5 w-3.5" />
              {t('common.copy')}
            </Button>
          </div>
          <Textarea
            value={output}
            readOnly
            spellCheck={false}
            className="min-h-[360px] font-mono text-sm leading-relaxed"
          />
        </div>
      </div>
    </div>
  )
}
