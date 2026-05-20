import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeftRight, ArrowUpDown, Copy, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { csvToJson, jsonToCsv, parseCSV } from '@/lib/csv'
import { cn } from '@/lib/utils'

type Mode = 'csv2json' | 'json2csv'
type DelimiterKey = ',' | ';' | '\t' | '|' | 'custom'
type QuoteKey = '"' | "'"

const SAMPLE_CSV = `name,age,city
Alice,30,Beijing
Bob,25,"Shanghai, Pudong"
Carol,28,Hangzhou`

const SAMPLE_JSON = JSON.stringify(
  [
    { name: 'Alice', age: 30, city: 'Beijing' },
    { name: 'Bob', age: 25, city: 'Shanghai, Pudong' },
    { name: 'Carol', age: 28, city: 'Hangzhou' },
  ],
  null,
  2,
)

const DELIMITER_OPTS: { key: DelimiterKey; labelKey: string; char: string | null }[] = [
  { key: ',', labelKey: 'pages.csvJson.delimComma', char: ',' },
  { key: ';', labelKey: 'pages.csvJson.delimSemicolon', char: ';' },
  { key: '\t', labelKey: 'pages.csvJson.delimTab', char: '\t' },
  { key: '|', labelKey: 'pages.csvJson.delimPipe', char: '|' },
  { key: 'custom', labelKey: 'pages.csvJson.delimCustom', char: null },
]

const QUOTE_OPTS: { key: QuoteKey; labelKey: string }[] = [
  { key: '"', labelKey: 'pages.csvJson.quoteDouble' },
  { key: "'", labelKey: 'pages.csvJson.quoteSingle' },
]

export function CsvJsonPage() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>('csv2json')
  const [input, setInput] = useState(SAMPLE_CSV)
  const [delimiterKey, setDelimiterKey] = useState<DelimiterKey>(',')
  const [customDelim, setCustomDelim] = useState(';')
  const [quote, setQuote] = useState<QuoteKey>('"')
  const [hasHeader, setHasHeader] = useState(true)
  const [infer, setInfer] = useState(false)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const activeDelim = delimiterKey === 'custom' ? customDelim : delimiterKey

  const result = useMemo(() => {
    if (!input.trim()) return { ok: true as const, value: '' }
    try {
      if (mode === 'csv2json') {
        const parsed = csvToJson(input, {
          delimiter: activeDelim,
          quote,
          header: hasHeader,
          infer,
        })
        return { ok: true as const, value: JSON.stringify(parsed, null, 2) }
      }
      const data = JSON.parse(input)
      return {
        ok: true as const,
        value: jsonToCsv(data, { delimiter: activeDelim, quote }),
      }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  }, [input, mode, activeDelim, quote, hasHeader, infer])

  // For the table preview we only need the parsed rows (CSV mode), or in JSON
  // mode the parsed JSON if it's an array of objects.
  const tableData = useMemo<{ headers: string[]; rows: unknown[][] } | null>(() => {
    if (!input.trim()) return null
    try {
      if (mode === 'csv2json') {
        const rows = parseCSV(input, { delimiter: activeDelim, quote })
        if (rows.length === 0) return null
        let headers: string[]
        let body: unknown[][]
        if (hasHeader) {
          headers = rows[0]
          body = rows.slice(1).map((r) =>
            headers.map((_, i) => {
              const raw = r[i] ?? ''
              return infer ? coerceForDisplay(raw) : raw
            }),
          )
        } else {
          const width = rows.reduce((m, r) => Math.max(m, r.length), 0)
          headers = Array.from({ length: width }, (_, i) => `col${i + 1}`)
          body = rows.map((r) =>
            headers.map((_, i) => {
              const raw = r[i] ?? ''
              return infer ? coerceForDisplay(raw) : raw
            }),
          )
        }
        return { headers, rows: body }
      }
      const data = JSON.parse(input)
      if (!Array.isArray(data) || data.length === 0) return null
      const headers: string[] = []
      for (const row of data) {
        if (typeof row !== 'object' || row === null || Array.isArray(row)) return null
        for (const k of Object.keys(row as object)) {
          if (!headers.includes(k)) headers.push(k)
        }
      }
      const body = (data as Record<string, unknown>[]).map((row) =>
        headers.map((k) => row[k] ?? ''),
      )
      return { headers, rows: body }
    } catch {
      return null
    }
  }, [input, mode, activeDelim, quote, hasHeader, infer])

  const sortedTable = useMemo(() => {
    if (!tableData || !sortKey) return tableData
    const idx = tableData.headers.indexOf(sortKey)
    if (idx < 0) return tableData
    const cmp = (a: unknown, b: unknown) => {
      if (typeof a === 'number' && typeof b === 'number') return a - b
      const sa = a == null ? '' : String(a)
      const sb = b == null ? '' : String(b)
      // Numeric compare when both sides look numeric.
      const na = Number(sa)
      const nb = Number(sb)
      if (sa !== '' && sb !== '' && Number.isFinite(na) && Number.isFinite(nb)) {
        return na - nb
      }
      return sa.localeCompare(sb)
    }
    const sign = sortDir === 'asc' ? 1 : -1
    const sortedRows = [...tableData.rows].sort((r1, r2) => sign * cmp(r1[idx], r2[idx]))
    return { headers: tableData.headers, rows: sortedRows }
  }, [tableData, sortKey, sortDir])

  const outputValue = result.ok ? result.value : ''
  const canCopy = result.ok && !!result.value

  const handleCopy = async () => {
    if (!canCopy) return
    await navigator.clipboard.writeText(outputValue)
    toast.success(t('common.copied'))
  }

  const handleSwap = () => {
    if (result.ok && result.value) setInput(result.value)
    setMode((m) => (m === 'csv2json' ? 'json2csv' : 'csv2json'))
    setSortKey(null)
  }

  const handleClear = () => setInput('')

  const switchMode = (next: Mode) => {
    if (next === mode) return
    setMode(next)
    setInput(next === 'csv2json' ? SAMPLE_CSV : SAMPLE_JSON)
    setSortKey(null)
  }

  const toggleSort = (header: string) => {
    if (sortKey === header) {
      if (sortDir === 'asc') setSortDir('desc')
      else {
        setSortKey(null)
        setSortDir('asc')
      }
    } else {
      setSortKey(header)
      setSortDir('asc')
    }
  }

  const inputLabel =
    mode === 'csv2json' ? t('pages.csvJson.csvLabel') : t('pages.csvJson.jsonArrayLabel')
  const outputLabel =
    mode === 'csv2json' ? t('pages.csvJson.jsonLabel') : t('pages.csvJson.csvLabel')

  return (
    <div className="mx-auto max-w-7xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.csv-json.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.csvJson.description')}</p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-input bg-transparent text-sm">
          {(
            [
              ['csv2json', t('pages.csvJson.csvToJson')],
              ['json2csv', t('pages.csvJson.jsonToCsv')],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`px-3 py-1.5 transition-colors ${
                mode === m
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={handleSwap}>
          <ArrowLeftRight className="h-4 w-4" />
          {t('common.swap')}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleClear}>
          <Trash2 className="h-4 w-4" />
          {t('common.clear')}
        </Button>
      </div>

      <div className="mb-4 grid gap-3 rounded-md border border-border bg-muted/10 p-3 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">
            {t('pages.csvJson.delimiter')}
          </Label>
          <div className="flex flex-wrap gap-1">
            {DELIMITER_OPTS.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => setDelimiterKey(d.key)}
                className={cn(
                  'rounded border border-input px-2 py-1 text-xs transition-colors',
                  delimiterKey === d.key
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(d.labelKey)}
              </button>
            ))}
          </div>
          {delimiterKey === 'custom' && (
            <Input
              value={customDelim}
              onChange={(e) => setCustomDelim(e.target.value.slice(0, 1))}
              maxLength={1}
              className="mt-2 h-7 w-20 font-mono text-xs"
              placeholder=";"
            />
          )}
        </div>

        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">
            {t('pages.csvJson.quote')}
          </Label>
          <div className="flex flex-wrap gap-1">
            {QUOTE_OPTS.map((q) => (
              <button
                key={q.key}
                type="button"
                onClick={() => setQuote(q.key)}
                className={cn(
                  'rounded border border-input px-2 py-1 text-xs transition-colors',
                  quote === q.key
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(q.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">
            {t('pages.csvJson.parsing')}
          </Label>
          <div className="flex flex-col gap-1.5">
            <label
              className={cn(
                'flex items-center gap-2 text-xs',
                mode === 'json2csv' && 'opacity-50',
              )}
            >
              <input
                type="checkbox"
                checked={hasHeader}
                onChange={(e) => setHasHeader(e.target.checked)}
                disabled={mode === 'json2csv'}
                className="h-3.5 w-3.5 accent-primary"
              />
              {t('pages.csvJson.firstRowHeader')}
            </label>
            <label
              className={cn(
                'flex items-center gap-2 text-xs',
                mode === 'json2csv' && 'opacity-50',
              )}
            >
              <input
                type="checkbox"
                checked={infer}
                onChange={(e) => setInfer(e.target.checked)}
                disabled={mode === 'json2csv'}
                className="h-3.5 w-3.5 accent-primary"
              />
              {t('pages.csvJson.inferTypes')}
            </label>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          <Label className="mb-1 block text-xs text-muted-foreground">
            {t('pages.csvJson.activeChar')}
          </Label>
          <div className="font-mono">
            {t('pages.csvJson.delimiter')}:{' '}
            <span className="text-foreground">{displayChar(activeDelim)}</span>
          </div>
          <div className="font-mono">
            {t('pages.csvJson.quote')}:{' '}
            <span className="text-foreground">{displayChar(quote)}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">{inputLabel}</Label>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            className="min-h-[360px] font-mono text-sm leading-relaxed"
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">{outputLabel}</Label>
            <Button size="sm" variant="ghost" onClick={handleCopy} disabled={!canCopy}>
              <Copy className="h-3.5 w-3.5" />
              {t('common.copy')}
            </Button>
          </div>
          <Textarea
            value={outputValue}
            readOnly
            spellCheck={false}
            className="min-h-[360px] font-mono text-sm leading-relaxed"
          />
        </div>
      </div>

      {!result.ok ? (
        <div className="mt-3 text-xs text-destructive">⚠ {result.error}</div>
      ) : null}

      <div className="mt-6">
        <Label className="mb-1.5 block text-xs text-muted-foreground">
          {t('pages.csvJson.tablePreview')}
        </Label>
        <div className="overflow-auto rounded-md border border-border bg-muted/20">
          {sortedTable && sortedTable.rows.length > 0 ? (
            <table className="w-full border-collapse text-xs">
              <thead className="bg-muted/40">
                <tr>
                  {sortedTable.headers.map((h) => (
                    <th
                      key={h}
                      onClick={() => toggleSort(h)}
                      className="cursor-pointer border-b border-border px-2 py-1.5 text-left font-medium hover:bg-accent/30"
                    >
                      <span className="inline-flex items-center gap-1">
                        {h}
                        <ArrowUpDown
                          className={cn(
                            'h-3 w-3 opacity-30',
                            sortKey === h && 'opacity-100',
                          )}
                        />
                        {sortKey === h && (
                          <span className="text-[10px] text-muted-foreground">
                            {sortDir === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedTable.rows.map((row, ri) => (
                  <tr key={ri} className="border-b border-border/50 last:border-0">
                    {sortedTable.headers.map((_, ci) => (
                      <td key={ci} className="px-2 py-1 font-mono">
                        {formatCell(row[ci])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-3 py-4 text-xs text-muted-foreground">
              {t('common.noResult')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function coerceForDisplay(value: string): unknown {
  if (value === '') return ''
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null') return null
  if (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(value)) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return value
}

function displayChar(c: string): string {
  if (c === '\t') return '\\t (tab)'
  if (c === ' ') return '" " (space)'
  return c
}

function formatCell(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
