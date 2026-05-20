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
  bytesToHex,
  downloadBlob,
  formatSize,
  hexToBytes,
  sniffMime,
} from '@/lib/file-bytes'

const SAMPLE = 'Hello 工具箱'

type Mode = 'encode' | 'decode'
type Tab = 'text' | 'file'

/** Render an xxd-style dump for the given bytes. */
function formatHexDump(bytes: Uint8Array): string {
  const lines: string[] = []
  const total = bytes.length
  for (let off = 0; off < total; off += 16) {
    const chunk = bytes.subarray(off, Math.min(off + 16, total))
    const hexParts: string[] = []
    let ascii = ''
    for (let i = 0; i < 16; i++) {
      if (i < chunk.length) {
        const b = chunk[i]
        hexParts.push(b.toString(16).padStart(2, '0'))
        ascii += b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.'
      } else {
        hexParts.push('  ')
      }
      if (i === 7) hexParts.push('') // extra space in the middle, like xxd
    }
    const offset = off.toString(16).padStart(8, '0')
    lines.push(`${offset}  ${hexParts.join(' ')}  |${ascii}|`)
  }
  return lines.join('\n')
}

export function HexPage() {
  const { t } = useTranslation()
  const [withSpace, setWithSpace] = useState(false)
  const [dumpView, setDumpView] = useState(false)
  const [tab, setTab] = useState<Tab>('text')

  const encode = useCallback(
    (s: string) => {
      const bytes = new TextEncoder().encode(s)
      if (dumpView) return formatHexDump(bytes)
      return bytesToHex(bytes, withSpace ? ' ' : '')
    },
    [withSpace, dumpView],
  )
  const decode = useCallback(
    (s: string) => new TextDecoder('utf-8', { fatal: false }).decode(hexToBytes(s)),
    [],
  )

  const optionsBlock = (
    <div className="flex flex-wrap items-center gap-3">
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
            {m === 'text' ? t('pages.hex.modeText') : t('pages.hex.modeFile')}
          </button>
        ))}
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
        <input
          type="checkbox"
          checked={withSpace}
          onChange={(e) => setWithSpace(e.target.checked)}
          className="accent-primary"
          disabled={dumpView}
        />
        {t('pages.hex.withSpace')}
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
        <input
          type="checkbox"
          checked={dumpView}
          onChange={(e) => setDumpView(e.target.checked)}
          className="accent-primary"
        />
        {t('pages.hex.dumpView')}
      </label>
    </div>
  )

  if (tab === 'text') {
    return (
      <EncodeDecode
        title={t('tools.hex.name')}
        description={t('pages.hex.description')}
        encode={encode}
        decode={decode}
        sample={SAMPLE}
        options={optionsBlock}
      />
    )
  }

  return <HexFilePanel options={optionsBlock} dumpView={dumpView} withSpace={withSpace} />
}

function HexFilePanel({
  options,
  dumpView,
  withSpace,
}: {
  options: React.ReactNode
  dumpView: boolean
  withSpace: boolean
}) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>('encode')

  // Encode
  const [pickedFile, setPickedFile] = useState<{ name: string; size: number } | null>(null)
  const [encodeError, setEncodeError] = useState<string | null>(null)
  const [lastBytes, setLastBytes] = useState<Uint8Array | null>(null)

  // Decode
  const [hexInput, setHexInput] = useState('')
  const [outName, setOutName] = useState('decoded.bin')

  // Derive encoded text from current bytes + format toggles.
  const encodedText = useMemo(() => {
    if (!lastBytes) return ''
    return dumpView ? formatHexDump(lastBytes) : bytesToHex(lastBytes, withSpace ? ' ' : '')
  }, [lastBytes, dumpView, withSpace])

  const decodeResult = useMemo<
    | { ok: true; bytes: Uint8Array; mime: string }
    | { ok: false; error: string }
    | null
  >(() => {
    if (!hexInput.trim()) return null
    try {
      const bytes = hexToBytes(hexInput)
      return { ok: true, bytes, mime: sniffMime(bytes) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }, [hexInput])

  const handlePick = async (file: File) => {
    try {
      const buf = await file.arrayBuffer()
      const bytes = new Uint8Array(buf)
      setLastBytes(bytes)
      setPickedFile({ name: file.name, size: file.size })
      setEncodeError(null)
    } catch (err) {
      setEncodeError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleDecodePick = async (file: File) => {
    try {
      const text = await file.text()
      setHexInput(text)
      if (!outName || outName === 'decoded.bin') {
        const stripped = file.name.replace(/\.(hex|txt)$/i, '')
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
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.hex.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.hex.description')}</p>
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
        <div className="ml-auto flex items-center gap-3">{options}</div>
      </div>

      {mode === 'encode' ? (
        <div className="space-y-3">
          <FileDrop
            onFile={handlePick}
            label={t('pages.hex.fileDropEncode')}
          />
          {pickedFile ? (
            <p className="text-xs text-muted-foreground">
              {t('pages.hex.fileInfo', {
                name: pickedFile.name,
                size: formatSize(pickedFile.size),
              })}
            </p>
          ) : null}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                {t('pages.hex.encoded')}
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
            {dumpView ? (
              <pre className="min-h-[280px] overflow-auto rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs leading-relaxed">
                {encodedText || t('pages.hex.dumpEmpty')}
              </pre>
            ) : (
              <Textarea
                value={encodedText}
                readOnly
                spellCheck={false}
                className="min-h-[280px] font-mono text-xs leading-relaxed"
              />
            )}
          </div>
          {encodeError ? (
            <div className="text-xs text-destructive">⚠ {encodeError}</div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <FileDrop
            onFile={handleDecodePick}
            label={t('pages.hex.fileDropDecode')}
            accept=".hex,.txt,text/plain"
          />
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">
              {t('common.input')}
            </Label>
            <Textarea
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              spellCheck={false}
              className="min-h-[200px] font-mono text-xs leading-relaxed"
              placeholder={t('pages.encodeDecode.inputPlaceholderDecode')}
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="mb-1.5 block text-xs text-muted-foreground">
                {t('pages.hex.decodedFilename')}
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
              {t('pages.hex.downloadDecoded')}
            </Button>
          </div>
          {decodeResult && decodeResult.ok ? (
            <p className="text-xs text-muted-foreground">
              {t('pages.hex.decodedReady', {
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
