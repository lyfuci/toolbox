import { useMemo, useState } from 'react'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

const SAMPLE_PATTERN = String.raw`(\w+)@(\w+)\.com`
const SAMPLE_TEXT = `联系：alice@example.com 或 bob@toolbox.com
其他: invalid@nope, another@example.com`

const FLAG_OPTS: { flag: string; label: string }[] = [
  { flag: 'g', label: 'g (全局)' },
  { flag: 'i', label: 'i (忽略大小写)' },
  { flag: 'm', label: 'm (多行)' },
  { flag: 's', label: 's (.匹配换行)' },
  { flag: 'u', label: 'u (Unicode)' },
  { flag: 'y', label: 'y (粘性)' },
]

type Match = {
  match: string
  index: number
  groups: string[]
  named: Record<string, string> | undefined
}

function evalRegex(pattern: string, flags: string, text: string) {
  if (!pattern) return { ok: true as const, regex: null, matches: [] as Match[] }
  const fl = flags.includes('g') ? flags : flags + 'g'
  let re: RegExp
  try {
    re = new RegExp(pattern, fl)
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
  }
  const matches: Match[] = []
  let m: RegExpExecArray | null
  let safetyBudget = 5000
  while ((m = re.exec(text)) !== null && safetyBudget-- > 0) {
    matches.push({
      match: m[0],
      index: m.index,
      groups: m.slice(1),
      named: m.groups ? { ...m.groups } : undefined,
    })
    if (m[0].length === 0) re.lastIndex++ // avoid infinite loop on zero-width matches
  }
  return { ok: true as const, regex: re, matches }
}

export function RegexPage() {
  const [pattern, setPattern] = useState(SAMPLE_PATTERN)
  const [flagSet, setFlagSet] = useState<Set<string>>(new Set(['g']))
  const [text, setText] = useState(SAMPLE_TEXT)
  const [replacement, setReplacement] = useState('<$1@$2.com>')

  const flags = Array.from(flagSet).join('')
  const result = useMemo(() => evalRegex(pattern, flags, text), [pattern, flags, text])

  const replacePreview = useMemo(() => {
    if (!result.ok || !result.regex) return ''
    try {
      return text.replace(result.regex, replacement)
    } catch (err) {
      return `(replace error: ${err instanceof Error ? err.message : String(err)})`
    }
  }, [result, text, replacement])

  const handleCopy = async (v: string) => {
    if (!v) return
    await navigator.clipboard.writeText(v)
    toast.success('已复制')
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Regex Tester</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          基于浏览器原生 RegExp。支持全部 ECMAScript 标志。
        </p>
      </header>

      <div className="mb-3 flex items-center gap-2">
        <code className="text-muted-foreground">/</code>
        <Input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          spellCheck={false}
          className="flex-1 font-mono text-sm"
          placeholder="正则表达式…"
        />
        <code className="text-muted-foreground">/</code>
        <code className="font-mono text-sm">{flags}</code>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        {FLAG_OPTS.map(({ flag, label }) => (
          <label
            key={flag}
            className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none"
          >
            <input
              type="checkbox"
              checked={flagSet.has(flag)}
              onChange={(e) => {
                setFlagSet((s) => {
                  const next = new Set(s)
                  if (e.target.checked) next.add(flag)
                  else next.delete(flag)
                  return next
                })
              }}
              className="accent-primary"
            />
            {label}
          </label>
        ))}
      </div>

      <div className="mb-4">
        <Label className="mb-1.5 block text-xs text-muted-foreground">测试文本</Label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="min-h-[160px] font-mono text-sm leading-relaxed"
        />
      </div>

      {!result.ok ? (
        <div className="text-xs text-destructive">⚠ {result.error}</div>
      ) : (
        <>
          <div className="mb-4">
            <Label className="mb-2 block text-xs text-muted-foreground">
              匹配 ({result.matches.length})
            </Label>
            {result.matches.length === 0 ? (
              <div className="text-xs text-muted-foreground">无匹配</div>
            ) : (
              <div className="flex flex-col gap-2">
                {result.matches.map((m, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-border bg-card/40 px-3 py-2 font-mono text-xs"
                  >
                    <div>
                      <span className="text-muted-foreground">[{m.index}]</span>{' '}
                      <span className="text-emerald-700 dark:text-emerald-300">{m.match}</span>
                    </div>
                    {m.groups.length > 0 ? (
                      <div className="mt-1 text-muted-foreground">
                        groups: [
                        {m.groups.map((g, j) => (
                          <span key={j}>
                            {j > 0 ? ', ' : ''}
                            <span className="text-foreground">{JSON.stringify(g)}</span>
                          </span>
                        ))}
                        ]
                      </div>
                    ) : null}
                    {m.named ? (
                      <div className="mt-1 text-muted-foreground">
                        named: {JSON.stringify(m.named)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-2">
            <Label className="mb-1.5 block text-xs text-muted-foreground">
              替换字符串（支持 $1 / $&lt;name&gt; 等反向引用）
            </Label>
            <Input
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              spellCheck={false}
              className="font-mono text-sm"
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">替换后预览</Label>
              <Button size="sm" variant="ghost" onClick={() => handleCopy(replacePreview)}>
                <Copy className="h-3.5 w-3.5" />
                复制
              </Button>
            </div>
            <Textarea
              value={replacePreview}
              readOnly
              spellCheck={false}
              className="min-h-[120px] font-mono text-sm leading-relaxed"
            />
          </div>
        </>
      )}
    </div>
  )
}
