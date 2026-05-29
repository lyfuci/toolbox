import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Check,
  Copy,
  X,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { pwnedPasswordCount } from '@/lib/hibp'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  HASH_ALGOS,
  type HashAlgo,
  type DigestEncoding,
  encodeBytes,
  hashBytes,
} from '@/lib/hash'
import { FieldTooltip } from '@/components/FieldTooltip'
import { FileDrop } from '@/components/FileDrop'
import { formatSize } from '@/lib/file-bytes'

const SAMPLE = 'The quick brown fox jumps over the lazy dog'

type Tab = 'text' | 'file'

type PwnedState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'done'; count: number }
  | { kind: 'error'; message: string }

const ENCODINGS: DigestEncoding[] = ['hex', 'base64', 'base64url']

function emptyResults(): Record<HashAlgo, Uint8Array | null> {
  return {
    MD5: null,
    'SHA-1': null,
    'SHA-256': null,
    'SHA-384': null,
    'SHA-512': null,
  }
}

export function HashPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('text')
  const [input, setInput] = useState(SAMPLE)
  const [encoding, setEncoding] = useState<DigestEncoding>('hex')
  const [pickedFile, setPickedFile] = useState<{ name: string; size: number } | null>(null)
  const [computing, setComputing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Pwned-password (HIBP) check — explicit-trigger only; reset when input edits.
  const [pwned, setPwned] = useState<PwnedState>({ kind: 'idle' })
  // ^ `computing` only flips during the file-mode async path (text mode is instant);
  //   the text-mode useEffect intentionally doesn't touch it to satisfy the
  //   react-hooks/set-state-in-effect rule.
  const [verify, setVerify] = useState<Record<HashAlgo, string>>({
    MD5: '',
    'SHA-1': '',
    'SHA-256': '',
    'SHA-384': '',
    'SHA-512': '',
  })
  // Raw digest bytes per algo. Formatting happens at render time so the encoding
  // toggle doesn't trigger re-hashing.
  const [digests, setDigests] = useState<Record<HashAlgo, Uint8Array | null>>(emptyResults)

  // Hash text whenever input changes (text mode only).
  useEffect(() => {
    if (tab !== 'text') return
    let cancelled = false
    const bytes = new TextEncoder().encode(input)
    Promise.all(HASH_ALGOS.map(async (algo) => [algo, await hashBytes(algo, bytes)] as const))
      .then((pairs) => {
        if (cancelled) return
        const next = emptyResults()
        for (const [algo, d] of pairs) next[algo] = d
        setDigests(next)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [input, tab])

  const handlePick = async (file: File) => {
    setError(null)
    setComputing(true)
    setPickedFile({ name: file.name, size: file.size })
    setDigests(emptyResults)
    try {
      const buf = await file.arrayBuffer()
      const bytes = new Uint8Array(buf)
      const pairs = await Promise.all(
        HASH_ALGOS.map(async (algo) => [algo, await hashBytes(algo, bytes)] as const),
      )
      const next = emptyResults()
      for (const [algo, d] of pairs) next[algo] = d
      setDigests(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setComputing(false)
    }
  }

  const formatted = (algo: HashAlgo): string => {
    const d = digests[algo]
    return d ? encodeBytes(d, encoding) : ''
  }

  const handleCopy = async (algo: HashAlgo) => {
    const value = formatted(algo)
    if (!value) return
    await navigator.clipboard.writeText(value)
    toast.success(t('common.copiedLabel', { label: algo }))
  }

  // Strip the textarea's (almost always unintended) trailing newline before
  // treating the input as a password. Internal/leading spaces are preserved —
  // passwords can contain them.
  const pwnedCandidate = input.replace(/[\r\n]+$/, '')

  const checkPwned = async () => {
    if (!pwnedCandidate) return
    setPwned({ kind: 'checking' })
    try {
      const count = await pwnedPasswordCount(pwnedCandidate)
      setPwned({ kind: 'done', count })
    } catch (e) {
      setPwned({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.hash.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.hash.description')}</p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-input bg-transparent text-sm">
          {(['text', 'file'] as Tab[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setTab(m)}
              className={`px-3 py-1.5 transition-colors ${
                tab === m
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {m === 'text' ? t('pages.hash.modeText') : t('pages.hash.modeFile')}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">
            {t('pages.hash.outputEncoding')}
          </Label>
          <div className="flex rounded-md border border-input bg-transparent text-xs">
            {ENCODINGS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEncoding(e)}
                className={`px-2.5 py-1 transition-colors ${
                  encoding === e
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'text' ? (
        <Textarea
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setPwned({ kind: 'idle' })
          }}
          spellCheck={false}
          className="mb-6 min-h-[180px] font-mono text-sm leading-relaxed"
          placeholder={t('pages.hash.placeholder')}
        />
      ) : (
        <div className="mb-6 space-y-2">
          <FileDrop
            onFile={handlePick}
            label={t('pages.hash.fileDrop')}
            hint={t('pages.hash.fileHint')}
          />
          {pickedFile ? (
            <p className="text-xs text-muted-foreground">
              {t('pages.hash.fileInfo', {
                name: pickedFile.name,
                size: formatSize(pickedFile.size),
              })}
              {computing ? ` — ${t('pages.hash.computing')}` : ''}
            </p>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {HASH_ALGOS.map((algo) => {
          const value = formatted(algo)
          const expected = verify[algo].trim()
          const match = expected ? expected.toLowerCase() === value.toLowerCase() : null
          return (
            <div
              key={algo}
              className="flex flex-col gap-2 rounded-md border border-border bg-card/40 px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <FieldTooltip body={`fieldMeta.hashAlg.${algo}`} bodyIsKey>
                  <span className="w-20 shrink-0 font-mono text-xs font-medium text-muted-foreground">
                    {algo}
                  </span>
                </FieldTooltip>
                <code className="flex-1 truncate font-mono text-xs">{value}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleCopy(algo)}
                  disabled={!value}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-2 pl-[5.75rem]">
                <Label className="text-xs text-muted-foreground">{t('pages.hash.verify')}</Label>
                <Input
                  value={verify[algo]}
                  onChange={(e) => setVerify((v) => ({ ...v, [algo]: e.target.value }))}
                  placeholder={t('pages.hash.verifyPlaceholder')}
                  spellCheck={false}
                  className="h-7 font-mono text-xs"
                />
                {match === true ? (
                  <span
                    className="flex shrink-0 items-center gap-1 text-xs text-emerald-500"
                    title={t('pages.hash.verifyMatch')}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {t('pages.hash.verifyMatch')}
                  </span>
                ) : match === false ? (
                  <span
                    className="flex shrink-0 items-center gap-1 text-xs text-destructive"
                    title={t('pages.hash.verifyMismatch')}
                  >
                    <X className="h-3.5 w-3.5" />
                    {t('pages.hash.verifyMismatch')}
                  </span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {error ? <div className="mt-3 text-xs text-destructive">⚠ {error}</div> : null}

      {tab === 'text' ? (
        <div className="mt-4 rounded-md border border-border bg-card/40 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {t('pages.hash.pwned.title')}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={checkPwned}
              disabled={pwned.kind === 'checking' || !pwnedCandidate}
            >
              {pwned.kind === 'checking' ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  {t('pages.hash.pwned.checking')}
                </>
              ) : (
                t('pages.hash.pwned.check')
              )}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t('pages.hash.pwned.note')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('pages.hash.pwned.emailHint')}{' '}
            <a
              href="https://haveibeenpwned.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {t('pages.hash.pwned.emailLink')}
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>
          {pwned.kind === 'done' && pwned.count > 0 ? (
            <div className="mt-2 flex items-center gap-2 text-sm text-destructive">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              {t('pages.hash.pwned.found', {
                times: pwned.count.toLocaleString(),
              })}
            </div>
          ) : null}
          {pwned.kind === 'done' && pwned.count === 0 ? (
            <div className="mt-2 flex items-center gap-2 text-sm text-emerald-500">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              {t('pages.hash.pwned.notFound')}
            </div>
          ) : null}
          {pwned.kind === 'error' ? (
            <div className="mt-2 text-sm text-destructive">
              ⚠ {t('pages.hash.pwned.error', { message: pwned.message })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
