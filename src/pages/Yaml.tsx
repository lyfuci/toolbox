import { useMemo, useState } from 'react'
import yaml from 'js-yaml'
import { ArrowLeftRight, Copy, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

type Mode = 'yaml2json' | 'json2yaml'

const SAMPLE_YAML = `# kubernetes-style sample
apiVersion: v1
kind: Pod
metadata:
  name: toolbox
  labels:
    app: demo
spec:
  containers:
    - name: web
      image: nginx:1.27
      ports:
        - containerPort: 80
`

const SAMPLE_JSON = JSON.stringify(
  {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'toolbox', labels: { app: 'demo' } },
    spec: {
      containers: [
        { name: 'web', image: 'nginx:1.27', ports: [{ containerPort: 80 }] },
      ],
    },
  },
  null,
  2,
)

function transform(input: string, mode: Mode): string {
  if (!input.trim()) return ''
  if (mode === 'yaml2json') {
    const parsed = yaml.load(input)
    return JSON.stringify(parsed, null, 2)
  }
  const parsed = JSON.parse(input)
  return yaml.dump(parsed, { lineWidth: 120, noRefs: true })
}

export function YamlPage() {
  const [mode, setMode] = useState<Mode>('yaml2json')
  const [input, setInput] = useState(SAMPLE_YAML)

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
    setMode((m) => (m === 'yaml2json' ? 'json2yaml' : 'yaml2json'))
  }
  const handleClear = () => setInput('')

  const switchMode = (next: Mode) => {
    if (next === mode) return
    setMode(next)
    setInput(next === 'yaml2json' ? SAMPLE_YAML : SAMPLE_JSON)
  }

  const inputLabel = mode === 'yaml2json' ? 'YAML' : 'JSON'
  const outputLabel = mode === 'yaml2json' ? 'JSON' : 'YAML'

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">YAML</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          YAML 与 JSON 互转。基于 js-yaml，兼容 YAML 1.2 子集。
        </p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-input bg-transparent text-sm">
          {(
            [
              ['yaml2json', 'YAML → JSON'],
              ['json2yaml', 'JSON → YAML'],
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
            className="min-h-[420px] font-mono text-sm leading-relaxed"
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
            className="min-h-[420px] font-mono text-sm leading-relaxed"
          />
        </div>
      </div>

      {!result.ok ? (
        <div className="mt-3 text-xs text-destructive">⚠ {result.error}</div>
      ) : null}
    </div>
  )
}
