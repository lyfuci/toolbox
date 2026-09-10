import { useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ArrowLeftRight, Copy, Languages, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { LANGUAGES, translate, type ProviderId } from '@/lib/translate'

const PROVIDER_LABELS: Record<ProviderId, string> = {
  google: 'Google',
  mymemory: 'MyMemory',
}

export function TranslatePage() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [source, setSource] = useState('auto')
  const [target, setTarget] = useState('zh-CN')
  const [preserve, setPreserve] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ provider: ProviderId; detected?: string; failures: string[] } | null>(
    null,
  )
  const abort = useRef<AbortController | null>(null)

  const run = async () => {
    if (!input.trim() || loading) return
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setLoading(true)
    setError(null)
    try {
      const result = await translate(input, {
        source,
        target,
        preserveMarkdown: preserve,
        signal: controller.signal,
      })
      setOutput(result.text)
      setMeta({ provider: result.provider, detected: result.detected, failures: result.failures })
    } catch (err) {
      if (controller.signal.aborted) return
      setOutput('')
      setMeta(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  // Only meaningful once we know the source: 'auto' has nothing to swap in.
  const swap = () => {
    const from = source === 'auto' ? meta?.detected : source
    if (!from) return
    setSource(target)
    setTarget(from)
    setInput(output)
    setOutput(input)
    setMeta(null)
  }

  const copy = async () => {
    await navigator.clipboard.writeText(output)
    toast.success(t('common.copied'))
  }

  const canSwap = Boolean(output) && (source !== 'auto' || Boolean(meta?.detected))

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.translate.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.translate.description')}</p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          aria-label={t('pages.translate.sourceLabel')}
        >
          <option value="auto" className="bg-background text-foreground">
            {t('pages.translate.auto')}
          </option>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code} className="bg-background text-foreground">
              {l.label}
            </option>
          ))}
        </select>

        <Button
          variant="ghost"
          size="icon"
          onClick={swap}
          disabled={!canSwap}
          title={t('pages.translate.swap')}
          aria-label={t('pages.translate.swap')}
        >
          <ArrowLeftRight className="h-4 w-4" />
        </Button>

        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          aria-label={t('pages.translate.targetLabel')}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code} className="bg-background text-foreground">
              {l.label}
            </option>
          ))}
        </select>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
          <input
            type="checkbox"
            checked={preserve}
            onChange={(e) => setPreserve(e.target.checked)}
            className="accent-primary"
          />
          {t('pages.translate.preserveMarkdown')}
        </label>

        <Button onClick={run} disabled={loading || !input.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
          {t('pages.translate.action')}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run()
            }}
            placeholder={t('pages.translate.placeholder')}
            className="min-h-[22rem] font-mono text-sm"
            spellCheck={false}
          />
          <div className="mt-1 text-right text-xs text-muted-foreground">
            {t('pages.translate.chars', { n: input.length })}
          </div>
        </div>

        <div>
          <div className="relative">
            <Textarea
              value={output}
              readOnly
              placeholder={t('pages.translate.outputPlaceholder')}
              className="min-h-[22rem] font-mono text-sm"
              spellCheck={false}
            />
            {output ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={copy}
                className="absolute top-2 right-2"
                title={t('common.copy')}
                aria-label={t('common.copy')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-end gap-3 text-xs text-muted-foreground">
            {meta?.detected ? (
              <span>{t('pages.translate.detected', { lang: meta.detected })}</span>
            ) : null}
            {meta ? <span>{PROVIDER_LABELS[meta.provider]}</span> : null}
          </div>
        </div>
      </div>

      {error ? <div className="mt-4 text-xs text-destructive">⚠ {error}</div> : null}

      {meta?.failures.length ? (
        <div className="mt-4 rounded-md border border-border bg-card/30 p-3 text-xs text-muted-foreground">
          <div className="mb-1 font-medium text-foreground">{t('pages.translate.partial')}</div>
          {meta.failures.map((f) => (
            <div key={f} className="font-mono">
              {f}
            </div>
          ))}
        </div>
      ) : null}

      <p className="mt-6 text-xs text-muted-foreground">
        <Trans i18nKey="pages.translate.privacy" components={{ 1: <strong /> }} />
      </p>
    </div>
  )
}
