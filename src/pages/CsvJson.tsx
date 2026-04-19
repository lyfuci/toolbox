import { useMemo, useState } from 'react'
import { ArrowLeftRight, Copy, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { csvToJson, jsonToCsv } from '@/lib/csv'

type Mode = 'csv2json' | 'json2csv'

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

function transform(input: string, mode: Mode): string {
  if (!input.trim()) return ''
  if (mode === 'csv2json') {
    return JSON.stringify(csvToJson(input), null, 2)
  }
  return jsonToCsv(JSON.parse(input))
}

export function CsvJsonPage() {
  const [mode, setMode] = useState<Mode>('csv2json')
  const [input, setInput] = useState(SAMPLE_CSV)

  const result = useMemo(() => {
    try {
      return { ok: true as const, value: transform(input, mode) }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  }, [input, mode])

  const outputValue = result.ok ? result.value : ''
  const canCopy = result.ok && !!result.value

  const handleCopy = async () => {
    if (!canCopy) return
    await navigator.clipboard.writeText(outputValue)
    toast.success('已复制')
  }

  const handleSwap = () => {
    if (result.ok && result.value) setInput(result.value)
    setMode((m) => (m === 'csv2json' ? 'json2csv' : 'csv2json'))
  }

  const handleClear = () => setInput('')

  const switchMode = (next: Mode) => {
    if (next === mode) return
    setMode(next)
    setInput(next === 'csv2json' ? SAMPLE_CSV : SAMPLE_JSON)
  }

  const inputLabel = mode === 'csv2json' ? 'CSV' : 'JSON (array of objects)'
  const outputLabel = mode === 'csv2json' ? 'JSON' : 'CSV'

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">CSV ↔ JSON</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          CSV 与 JSON 互转。CSV 第一行作为字段名；JSON 须为对象数组。支持引号字段、字段内逗号 / 换行 / 转义引号。
        </p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-input bg-transparent text-sm">
          {(
            [
              ['csv2json', 'CSV → JSON'],
              ['json2csv', 'JSON → CSV'],
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
          交换
        </Button>
        <Button size="sm" variant="ghost" onClick={handleClear}>
          <Trash2 className="h-4 w-4" />
          清空
        </Button>
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
              复制
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
    </div>
  )
}
