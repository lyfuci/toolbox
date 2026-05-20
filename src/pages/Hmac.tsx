import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Eye, EyeOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  HMAC_ALGOS,
  type HmacAlgo,
  type DigestEncoding,
  type KeyEncoding,
  decodeKey,
  encodeBytes,
  hmacBytes,
} from '@/lib/hash'
import { FieldTooltip } from '@/components/FieldTooltip'
import { FileDrop } from '@/components/FileDrop'
import { formatSize } from '@/lib/file-bytes'

const ENCODINGS: DigestEncoding[] = ['hex', 'base64', 'base64url']
const KEY_ENCODINGS: KeyEncoding[] = ['utf-8', 'hex', 'base64']
type DataMode = 'text' | 'file'

export function HmacPage() {
  const { t } = useTranslation()
  const [input, setInput] = useState('hello world')
  const [key, setKey] = useState('your-256-bit-secret')
  const [keyEncoding, setKeyEncoding] = useState<KeyEncoding>('utf-8')
  const [revealKey, setRevealKey] = useState(false)
  const [algo, setAlgo] = useState<HmacAlgo>('SHA-256')
  const [encoding, setEncoding] = useState<DigestEncoding>('hex')
  const [dataMode, setDataMode] = useState<DataMode>('text')
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null)
  const [pickedFile, setPickedFile] = useState<{ name: string; size: number } | null>(null)
  const [verify, setVerify] = useState('')
  const [sigBytes, setSigBytes] = useState<Uint8Array | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let keyBytes: Uint8Array
    try {
      keyBytes = decodeKey(key, keyEncoding)
    } catch (err) {
      // Defer to next tick so this isn't a synchronous setState-in-effect.
      queueMicrotask(() => {
        if (cancelled) return
        setSigBytes(null)
        setError(err instanceof Error ? err.message : String(err))
      })
      return () => {
        cancelled = true
      }
    }
    const dataBytes =
      dataMode === 'text' ? new TextEncoder().encode(input) : fileBytes
    if (!dataBytes) {
      queueMicrotask(() => {
        if (cancelled) return
        setSigBytes(null)
      })
      return () => {
        cancelled = true
      }
    }
    hmacBytes(algo, keyBytes, dataBytes)
      .then((bytes) => {
        if (cancelled) return
        setSigBytes(bytes)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setSigBytes(null)
        setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [input, key, keyEncoding, algo, dataMode, fileBytes])

  const output = sigBytes ? encodeBytes(sigBytes, encoding) : ''
  const verifyTrimmed = verify.trim()
  const verifyMatch = verifyTrimmed
    ? verifyTrimmed.toLowerCase() === output.toLowerCase()
    : null

  const handleCopy = async () => {
    if (!output) return
    await navigator.clipboard.writeText(output)
    toast.success(t('common.copied'))
  }

  const handlePick = async (file: File) => {
    try {
      const buf = await file.arrayBuffer()
      setFileBytes(new Uint8Array(buf))
      setPickedFile({ name: file.name, size: file.size })
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.hmac.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.hmac.description')}</p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-input bg-transparent text-sm">
          {HMAC_ALGOS.map((a) => (
            <FieldTooltip key={a} body={`fieldMeta.hmacAlg.${a}`} bodyIsKey underline={false}>
              <button
                type="button"
                onClick={() => setAlgo(a)}
                className={`px-3 py-1.5 transition-colors ${
                  algo === a
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {a.replace('SHA-', 'HS')}
              </button>
            </FieldTooltip>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">
            {t('pages.hmac.outputEncoding')}
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

      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">{t('pages.hmac.key')}</Label>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">
              {t('pages.hmac.keyEncoding')}
            </Label>
            <div className="flex rounded-md border border-input bg-transparent text-xs">
              {KEY_ENCODINGS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setKeyEncoding(e)}
                  className={`px-2.5 py-1 transition-colors ${
                    keyEncoding === e
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
        <div className="relative">
          <Input
            value={key}
            type={revealKey ? 'text' : 'password'}
            onChange={(e) => setKey(e.target.value)}
            spellCheck={false}
            className="pr-9 font-mono text-sm"
            placeholder={t('pages.hmac.keyPlaceholder')}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setRevealKey((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={revealKey ? t('pages.hmac.keyHide') : t('pages.hmac.keyReveal')}
            title={revealKey ? t('pages.hmac.keyHide') : t('pages.hmac.keyReveal')}
          >
            {revealKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">{t('pages.hmac.data')}</Label>
          <div className="flex rounded-md border border-input bg-transparent text-xs">
            {(['text', 'file'] as DataMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDataMode(m)}
                className={`px-2.5 py-1 transition-colors ${
                  dataMode === m
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m === 'text'
                  ? t('pages.hmac.dataModeText')
                  : t('pages.hmac.dataModeFile')}
              </button>
            ))}
          </div>
        </div>
        {dataMode === 'text' ? (
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            className="min-h-[180px] font-mono text-sm leading-relaxed"
            placeholder={t('pages.hmac.dataPlaceholder')}
          />
        ) : (
          <div className="space-y-2">
            <FileDrop onFile={handlePick} label={t('pages.hmac.fileDrop')} />
            {pickedFile ? (
              <p className="text-xs text-muted-foreground">
                {t('pages.hmac.fileInfo', {
                  name: pickedFile.name,
                  size: formatSize(pickedFile.size),
                })}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">{t('pages.hmac.signature')}</Label>
          <Button size="sm" variant="ghost" onClick={handleCopy} disabled={!output}>
            <Copy className="h-3.5 w-3.5" />
            {t('common.copy')}
          </Button>
        </div>
        <Textarea
          value={output}
          readOnly
          spellCheck={false}
          className="min-h-[100px] font-mono text-xs leading-relaxed"
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">{t('pages.hmac.verify')}</Label>
        <Input
          value={verify}
          onChange={(e) => setVerify(e.target.value)}
          placeholder={t('pages.hmac.verifyPlaceholder')}
          spellCheck={false}
          className="h-7 font-mono text-xs"
        />
        {verifyMatch === true ? (
          <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-500">
            <Check className="h-3.5 w-3.5" />
            {t('pages.hmac.verifyMatch')}
          </span>
        ) : verifyMatch === false ? (
          <span className="flex shrink-0 items-center gap-1 text-xs text-destructive">
            <X className="h-3.5 w-3.5" />
            {t('pages.hmac.verifyMismatch')}
          </span>
        ) : null}
      </div>

      {error ? <div className="mt-3 text-xs text-destructive">⚠ {error}</div> : null}
    </div>
  )
}
