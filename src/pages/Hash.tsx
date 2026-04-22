import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { HASH_ALGOS, type HashAlgo, hashText } from '@/lib/hash'
import { FieldTooltip } from '@/components/FieldTooltip'

const SAMPLE = 'The quick brown fox jumps over the lazy dog'

export function HashPage() {
  const { t } = useTranslation()
  const [input, setInput] = useState(SAMPLE)
  const [results, setResults] = useState<Record<HashAlgo, string>>({
    'MD5': '',
    'SHA-1': '',
    'SHA-256': '',
    'SHA-384': '',
    'SHA-512': '',
  })

  useEffect(() => {
    let cancelled = false
    Promise.all(
      HASH_ALGOS.map(async (algo) => [algo, await hashText(algo, input)] as const),
    ).then((pairs) => {
      if (cancelled) return
      const next = {} as Record<HashAlgo, string>
      for (const [algo, hex] of pairs) next[algo] = hex
      setResults(next)
    })
    return () => {
      cancelled = true
    }
  }, [input])

  const handleCopy = async (algo: HashAlgo) => {
    await navigator.clipboard.writeText(results[algo])
    toast.success(t('common.copiedLabel', { label: algo }))
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.hash.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.hash.description')}</p>
      </header>

      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        spellCheck={false}
        className="mb-6 min-h-[180px] font-mono text-sm leading-relaxed"
        placeholder={t('pages.hash.placeholder')}
      />

      <div className="flex flex-col gap-2">
        {HASH_ALGOS.map((algo) => (
          <div
            key={algo}
            className="flex items-center gap-3 rounded-md border border-border bg-card/40 px-3 py-2"
          >
            <FieldTooltip body={`fieldMeta.hashAlg.${algo}`} bodyIsKey>
              <span className="w-20 shrink-0 font-mono text-xs font-medium text-muted-foreground">
                {algo}
              </span>
            </FieldTooltip>
            <code className="flex-1 truncate font-mono text-xs">{results[algo]}</code>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleCopy(algo)}
              disabled={!results[algo]}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
