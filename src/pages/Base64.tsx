import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Download } from 'lucide-react'
import { EncodeDecode } from '@/components/EncodeDecode'
import { FileDrop } from '@/components/FileDrop'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  base64ToBytes,
  bytesToBase64,
  downloadBlob,
  formatSize,
  sniffMime,
} from '@/lib/file-bytes'

const SAMPLE = 'Hello, 工具箱! 🛠️'

type Mode = 'encode' | 'decode'
type Tab = 'text' | 'file'

export function Base64Page() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('text')
  const [urlSafe, setUrlSafe] = useState(false)

  const encode = useCallback(
    (s: string) => bytesToBase64(new TextEncoder().encode(s), urlSafe),
    [urlSafe],
  )
  const decode = useCallback(
    (s: string) => new TextDecoder('utf-8', { fatal: false }).decode(base64ToBytes(s, urlSafe)),
    [urlSafe],
  )

  const urlSafeToggle = (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
      <input
        type="checkbox"
        checked={urlSafe}
        onChange={(e) => setUrlSafe(e.target.checked)}
        className="accent-primary"
      />
      {t('pages.base64.urlSafe')}
    </label>
  )

  const tabSwitch = (
    <div className="flex rounded-md border border-input bg-transparent text-xs">
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
          {m === 'text' ? t('pages.base64.modeText') : t('pages.base64.modeFile')}
        </button>
      ))}
    </div>
  )

  if (tab === 'text') {
    return (
      <EncodeDecode
        title={t('tools.base64.name')}
        description={t('pages.base64.description')}
        encode={encode}
        decode={decode}
        sample={SAMPLE}
        options={
          <div className="flex items-center gap-3">
            {tabSwitch}
            {urlSafeToggle}
          </div>
        }
      />
    )
  }

  return (
    <Base64FilePanel
      tabSwitch={tabSwitch}
      urlSafeToggle={urlSafeToggle}
      urlSafe={urlSafe}
    />
  )
}

function Base64FilePanel({
  tabSwitch,
  urlSafeToggle,
  urlSafe,
}: {
  tabSwitch: React.ReactNode
  urlSafeToggle: React.ReactNode
  urlSafe: boolean
}) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>('encode')

  // Encode-side state
  const [encodedText, setEncodedText] = useState('')
  const [pickedFile, setPickedFile] = useState<{ name: string; size: number } | null>(null)
  const [encodeError, setEncodeError] = useState<string | null>(null)

  // Decode-side state
  const [base64Input, setBase64Input] = useState('')
  const [outName, setOutName] = useState('decoded.bin')

  const decodeResult = useMemo<
    | { ok: true; bytes: Uint8Array; mime: string }
    | { ok: false; error: string }
    | null
  >(() => {
    if (!base64Input.trim()) return null
    try {
      const bytes = base64ToBytes(base64Input, urlSafe)
      return { ok: true, bytes, mime: sniffMime(bytes) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }, [base64Input, urlSafe])

  const handlePick = async (file: File) => {
    try {
      const buf = await file.arrayBuffer()
      const bytes = new Uint8Array(buf)
      setEncodedText(bytesToBase64(bytes, urlSafe))
      setPickedFile({ name: file.name, size: file.size })
      setEncodeError(null)
    } catch (err) {
      setEncodeError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleDecodePick = async (file: File) => {
    try {
      const text = await file.text()
      setBase64Input(text)
      if (!outName || outName === 'decoded.bin') {
        // Re-derive a default name from the source filename, stripping common base64 wrappers.
        const stripped = file.name.replace(/\.(b64|base64|txt)$/i, '')
        if (stripped && stripped !== file.name) setOutName(stripped || 'decoded.bin')
      }
    } catch (err) {
      setEncodeError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleCopyEncoded = async () => {
    if (!encodedText) return
    await navigator.clipboard.writeText(encodedText)
    toast.success(t('common.copied'))
  }

  const handleDownloadDecoded = () => {
    if (!decodeResult || !decodeResult.ok) return
    downloadBlob(decodeResult.bytes, outName || 'decoded.bin', decodeResult.mime)
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.base64.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.base64.description')}</p>
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
              {m === 'encode'
                ? t('pages.encodeDecode.encodeBtn')
                : t('pages.encodeDecode.decodeBtn')}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {tabSwitch}
          {urlSafeToggle}
        </div>
      </div>

      {mode === 'encode' ? (
        <div className="space-y-3">
          <FileDrop
            onFile={handlePick}
            label={t('pages.base64.fileDropEncode')}
            hint={t('pages.base64.fileHintEncode')}
          />
          {pickedFile ? (
            <p className="text-xs text-muted-foreground">
              {t('pages.base64.fileInfo', {
                name: pickedFile.name,
                size: formatSize(pickedFile.size),
              })}
            </p>
          ) : null}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                {t('pages.base64.encoded')}
              </Label>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopyEncoded}
                disabled={!encodedText}
              >
                <Copy className="h-3.5 w-3.5" />
                {t('common.copy')}
              </Button>
            </div>
            <Textarea
              value={encodedText}
              readOnly
              spellCheck={false}
              className="min-h-[280px] font-mono text-xs leading-relaxed"
            />
          </div>
          {encodeError ? (
            <div className="text-xs text-destructive">⚠ {encodeError}</div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <FileDrop
            onFile={handleDecodePick}
            label={t('pages.base64.fileDropDecode')}
            hint={t('pages.base64.fileHintDecode')}
            accept=".txt,.b64,.base64,text/plain"
          />
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">
              {t('common.input')}
            </Label>
            <Textarea
              value={base64Input}
              onChange={(e) => setBase64Input(e.target.value)}
              spellCheck={false}
              className="min-h-[200px] font-mono text-xs leading-relaxed"
              placeholder={t('pages.encodeDecode.inputPlaceholderDecode')}
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="mb-1.5 block text-xs text-muted-foreground">
                {t('pages.base64.decodedFilename')}
              </Label>
              <Input
                value={outName}
                onChange={(e) => setOutName(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <Button
              onClick={handleDownloadDecoded}
              disabled={!decodeResult || !decodeResult.ok}
              size="sm"
            >
              <Download className="h-4 w-4" />
              {t('pages.base64.downloadDecoded')}
            </Button>
          </div>
          {decodeResult && decodeResult.ok ? (
            <p className="text-xs text-muted-foreground">
              {t('pages.base64.decodedReady', {
                size: formatSize(decodeResult.bytes.byteLength),
                mime: decodeResult.mime,
              })}
            </p>
          ) : null}
          {decodeResult && !decodeResult.ok ? (
            <div className="text-xs text-destructive">⚠ {decodeResult.error}</div>
          ) : null}
        </div>
      )}
    </div>
  )
}
