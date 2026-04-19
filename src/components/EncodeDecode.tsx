import { useMemo, useState, type ReactNode } from 'react'
import { ArrowLeftRight, Copy, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

type Mode = 'encode' | 'decode'

type Result =
  | { ok: true; value: string }
  | { ok: false; error: string }

export type EncodeDecodeProps = {
  title: string
  description: string
  encode: (s: string) => string
  decode: (s: string) => string
  sample?: string
  /** Tool-specific options rendered on the right of the toolbar (checkboxes, segment toggles, etc). */
  options?: ReactNode
  /** Initial mode when the tool first opens. Defaults to 'encode'. */
  initialMode?: Mode
}

/**
 * Two-pane encode/decode harness shared by Base64 / URL / Hex / HTML entity
 * (and any future text-in-text-out transform pair). Owns mode toggle, input
 * state, copy / clear / swap behaviors and error display so the per-tool
 * page only has to provide the transform functions and any custom options.
 */
export function EncodeDecode({
  title,
  description,
  encode,
  decode,
  sample,
  options,
  initialMode = 'encode',
}: EncodeDecodeProps) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [input, setInput] = useState(sample ?? '')

  const result = useMemo<Result>(() => {
    if (!input) return { ok: true, value: '' }
    try {
      return { ok: true, value: mode === 'encode' ? encode(input) : decode(input) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }, [mode, input, encode, decode])

  const outputValue = result.ok ? result.value : ''
  const canCopy = result.ok && result.value.length > 0

  const handleCopy = async () => {
    if (!canCopy) return
    await navigator.clipboard.writeText(outputValue)
    toast.success('已复制')
  }

  const handleClear = () => setInput('')

  const handleSwap = () => {
    // Always flip mode; if there's a usable output, also feed it back as the new input
    // so the user can verify roundtrips with one click.
    if (result.ok && result.value) setInput(result.value)
    setMode((m) => (m === 'encode' ? 'decode' : 'encode'))
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-input bg-transparent text-sm">
          {(['encode', 'decode'] as Mode[]).map((m) => (
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
              {m === 'encode' ? '编码' : '解码'}
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
        {options ? <div className="ml-auto flex items-center gap-3">{options}</div> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">输入</Label>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            className="min-h-[360px] font-mono text-sm leading-relaxed"
            placeholder={mode === 'encode' ? '原文…' : '编码后字符串…'}
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">输出</Label>
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
            placeholder={mode === 'encode' ? '编码结果…' : '解码结果…'}
          />
        </div>
      </div>

      {!result.ok ? (
        <div className="mt-3 text-xs text-destructive">⚠ {result.error}</div>
      ) : null}
    </div>
  )
}
