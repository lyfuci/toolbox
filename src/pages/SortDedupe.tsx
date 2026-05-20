import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Shuffle, FlipVertical, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

type SortDirection = 'none' | 'asc' | 'desc'
type SortMode = 'lex' | 'numeric' | 'natural' | 'length'

const SAMPLE = `banana
apple
Cherry
apple
date
banana
elderberry
img2
img10
img1
`

// Fisher-Yates shuffle (in place on a copy).
function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Numeric comparator: parse a leading float; NaNs sort last.
function cmpNumeric(a: string, b: string): number {
  const an = parseFloat(a)
  const bn = parseFloat(b)
  if (Number.isNaN(an) && Number.isNaN(bn)) return 0
  if (Number.isNaN(an)) return 1
  if (Number.isNaN(bn)) return -1
  return an - bn
}

// "Natural" compare via Intl.Collator with `numeric: true` — handles
// `img2 < img10` the way humans expect.
const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

function buildComparator(mode: SortMode, ignoreCase: boolean): (a: string, b: string) => number {
  if (mode === 'numeric') return cmpNumeric
  if (mode === 'length') return (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)
  if (mode === 'natural') return (a, b) => NATURAL_COLLATOR.compare(a, b)
  // lex
  return (a, b) => {
    const av = ignoreCase ? a.toLowerCase() : a
    const bv = ignoreCase ? b.toLowerCase() : b
    return av < bv ? -1 : av > bv ? 1 : 0
  }
}

type ProcessOpts = {
  direction: SortDirection
  mode: SortMode
  dedupe: boolean
  withCount: boolean
  trim: boolean
  ignoreCase: boolean
  removeBlank: boolean
  delimiter: string // '' => newline
  reverse: boolean
  shuffleSeed: number // bumping this triggers re-shuffle in useMemo
}

function split(input: string, delimiter: string): string[] {
  if (delimiter === '' || delimiter === '\n') return input.split('\n')
  return input.split(delimiter)
}

function join(parts: string[], delimiter: string): string {
  if (delimiter === '' || delimiter === '\n') return parts.join('\n')
  return parts.join(delimiter)
}

function process(input: string, opts: ProcessOpts): string[] {
  let lines = split(input, opts.delimiter)
  if (opts.trim) lines = lines.map((l) => l.trim())
  if (opts.removeBlank) lines = lines.filter((l) => l.length > 0)

  // Count duplicates BEFORE dedupe so we know how many times each line appeared.
  let counts: Map<string, number> | null = null
  if (opts.withCount) {
    counts = new Map<string, number>()
    for (const l of lines) {
      const key = opts.ignoreCase ? l.toLowerCase() : l
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  // `uniq -c` implies dedupe (counting only makes sense on a deduped stream).
  const shouldDedupe = opts.dedupe || opts.withCount
  if (shouldDedupe) {
    const seen = new Set<string>()
    lines = lines.filter((l) => {
      const key = opts.ignoreCase ? l.toLowerCase() : l
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  if (opts.direction !== 'none') {
    const cmp = buildComparator(opts.mode, opts.ignoreCase)
    lines.sort(opts.direction === 'asc' ? cmp : (a, b) => -cmp(a, b))
  }

  if (opts.reverse) lines = lines.slice().reverse()
  if (opts.shuffleSeed > 0) lines = shuffle(lines)

  if (counts) {
    lines = lines.map((l) => {
      const key = opts.ignoreCase ? l.toLowerCase() : l
      const n = counts!.get(key) ?? 1
      // Mirror `uniq -c` formatting: right-aligned count followed by the line.
      return `${String(n).padStart(4, ' ')} ${l}`
    })
  }

  return lines
}

export function SortDedupePage() {
  const { t } = useTranslation()
  const [input, setInput] = useState(SAMPLE)
  const [direction, setDirection] = useState<SortDirection>('asc')
  const [mode, setMode] = useState<SortMode>('lex')
  const [dedupe, setDedupe] = useState(true)
  const [withCount, setWithCount] = useState(false)
  const [trim, setTrim] = useState(true)
  const [ignoreCase, setIgnoreCase] = useState(false)
  const [removeBlank, setRemoveBlank] = useState(true)
  const [delimiter, setDelimiter] = useState('') // '' => newline
  const [reverse, setReverse] = useState(false)
  const [shuffleSeed, setShuffleSeed] = useState(0)

  const lines = useMemo(
    () =>
      process(input, {
        direction,
        mode,
        dedupe,
        withCount,
        trim,
        ignoreCase,
        removeBlank,
        delimiter,
        reverse,
        shuffleSeed,
      }),
    [input, direction, mode, dedupe, withCount, trim, ignoreCase, removeBlank, delimiter, reverse, shuffleSeed],
  )

  const output = join(lines, delimiter)

  const handleCopy = async () => {
    if (!output) return
    await navigator.clipboard.writeText(output)
    toast.success(t('common.copied'))
  }

  const inputLineCount = split(input, delimiter).length

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
            ] as [SortDirection, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setDirection(v)}
              className={`px-3 py-1 transition-colors ${
                direction === v
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <Label className="text-xs text-muted-foreground">{t('pages.sortDedupe.modeLabel')}</Label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as SortMode)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
        >
          <option value="lex">{t('pages.sortDedupe.modeLex')}</option>
          <option value="numeric">{t('pages.sortDedupe.modeNumeric')}</option>
          <option value="natural">{t('pages.sortDedupe.modeNatural')}</option>
          <option value="length">{t('pages.sortDedupe.modeLength')}</option>
        </select>

        {[
          { label: t('pages.sortDedupe.dedupe'), state: dedupe, setter: setDedupe },
          { label: t('pages.sortDedupe.withCount'), state: withCount, setter: setWithCount },
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

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Label className="text-xs text-muted-foreground">
          {t('pages.sortDedupe.delimiterLabel')}
        </Label>
        <Input
          value={delimiter}
          onChange={(e) => setDelimiter(e.target.value)}
          placeholder={t('pages.sortDedupe.delimiterPlaceholder')}
          className="h-8 w-32 font-mono text-xs"
          spellCheck={false}
        />
        <span className="text-xs text-muted-foreground">
          {delimiter === '' ? t('pages.sortDedupe.delimiterNewline') : `"${delimiter}"`}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setReverse((v) => !v)}
          className={reverse ? 'text-foreground' : ''}
        >
          <FlipVertical className="h-4 w-4" />
          {t('pages.sortDedupe.reverse')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShuffleSeed((n) => n + 1)}>
          <Shuffle className="h-4 w-4" />
          {t('pages.sortDedupe.shuffle')}
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
