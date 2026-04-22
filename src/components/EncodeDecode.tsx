import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
    toast.success(t('common.copied'))
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
              {m === 'encode' ? t('pages.encodeDecode.encodeBtn') : t('pages.encodeDecode.decodeBtn')}
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
        {options ? <div className="ml-auto flex items-center gap-3">{options}</div> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">{t('common.input')}</Label>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            className="min-h-[360px] font-mono text-sm leading-relaxed"
            placeholder={
              mode === 'encode'
                ? t('pages.encodeDecode.inputPlaceholderEncode')
                : t('pages.encodeDecode.inputPlaceholderDecode')
            }
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">{t('common.output')}</Label>
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
            placeholder={
              mode === 'encode'
                ? t('pages.encodeDecode.outputPlaceholderEncode')
                : t('pages.encodeDecode.outputPlaceholderDecode')
            }
          />
        </div>
      </div>

      {!result.ok ? (
        <div className="mt-3 text-xs text-destructive">⚠ {result.error}</div>
      ) : null}
    </div>
  )
}
