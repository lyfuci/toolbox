import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Play, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { DropZone } from '@/components/media/DropZone'
import { MediaCard, type MediaItem } from '@/components/media/MediaCard'
import { OutputView, type OutputResult } from '@/components/media/OutputView'
import {
  fetchFile,
  getFFmpeg,
  inferMime,
  run,
  toFFTime,
} from '@/lib/ffmpeg'

type Status =
  | { kind: 'idle' }
  | { kind: 'loading_ffmpeg' }
  | { kind: 'processing'; progress: number }

const stripExt = (name: string) => name.replace(/\.[^./]+$/, '')
const getExt = (name: string) => name.split('.').pop()?.toLowerCase() ?? 'bin'

export function MediaPage() {
  const { t } = useTranslation()
  const [items, setItems] = useState<MediaItem[]>([])
  const [output, setOutput] = useState<OutputResult | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [audioFormat, setAudioFormat] = useState<'mp3' | 'aac'>('mp3')
  const [convertFormat, setConvertFormat] = useState<'mp4' | 'gif'>('mp4')

  // Revoke object URLs on unmount to prevent memory leaks.
  useEffect(() => {
    return () => {
      items.forEach((i) => URL.revokeObjectURL(i.url))
      if (output) URL.revokeObjectURL(output.url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addFiles = (files: File[]) => {
    const next: MediaItem[] = files.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      url: URL.createObjectURL(f),
      isAudio: f.type.startsWith('audio/'),
      duration: null,
      inSec: 0,
      outSec: null,
    }))
    setItems((prev) => {
      const merged = [...prev, ...next]
      setSelectedId((cur) => cur ?? merged[0]?.id ?? null)
      return merged
    })
  }

  const updateItem = (id: string, patch: Partial<MediaItem>) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    )
  }

  const removeItem = (id: string) => {
    const item = items.find((i) => i.id === id)
    if (item) URL.revokeObjectURL(item.url)
    const next = items.filter((i) => i.id !== id)
    setItems(next)
    if (selectedId === id) setSelectedId(next[0]?.id ?? null)
  }

  const setResult = (blob: Blob, filename: string, mime: string) => {
    if (output) URL.revokeObjectURL(output.url)
    setOutput({
      url: URL.createObjectURL(blob),
      filename,
      mime,
      size: blob.size,
    })
  }

  const selected = items.find((i) => i.id === selectedId) ?? null

  // Generic operation runner with status + error handling.
  const runOp = async (op: () => Promise<void>) => {
    if (status.kind !== 'idle') return
    setStatus({ kind: 'loading_ffmpeg' })
    try {
      await getFFmpeg() // lazy load (no-op if already loaded)
      setStatus({ kind: 'processing', progress: 0 })
      await op()
      toast.success(t('media.processingDone'))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg, { duration: 8000 })
    } finally {
      setStatus({ kind: 'idle' })
    }
  }

  // ─── Operations ─────────────────────────────────────────────────────────

  const doTrim = () =>
    runOp(async () => {
      if (!selected) throw new Error(t('media.errSelectFirst'))
      const ext = getExt(selected.file.name)
      const inputName = `input.${ext}`
      const outputName = `trim.${ext}`
      const outSec = selected.outSec ?? selected.duration ?? 0
      if (outSec <= selected.inSec) {
        throw new Error(t('media.errOutAfterIn'))
      }
      const { blob } = await run({
        inputs: [{ name: inputName, data: selected.file }],
        command: [
          '-ss',
          toFFTime(selected.inSec),
          '-to',
          toFFTime(outSec),
          '-i',
          inputName,
          '-c',
          'copy',
          outputName,
        ],
        outputName,
        outputMime: inferMime(outputName),
        onProgress: (r) =>
          setStatus({ kind: 'processing', progress: r }),
      })
      setResult(
        blob,
        `${stripExt(selected.file.name)}_trim.${ext}`,
        inferMime(outputName),
      )
    })

  const doConcat = () =>
    runOp(async () => {
      if (items.length < 2) throw new Error(t('media.errNeedTwoFiles'))
      const ff = await getFFmpeg()
      const ext = getExt(items[0].file.name)
      // Demand uniform extension; concat demuxer needs matching codecs/containers.
      if (items.some((i) => getExt(i.file.name) !== ext)) {
        throw new Error(t('media.errMixedExt'))
      }
      const inputNames = items.map((_, i) => `in${i}.${ext}`)
      const outputName = `concat.${ext}`
      try {
        for (let i = 0; i < items.length; i++) {
          await ff.writeFile(inputNames[i], await fetchFile(items[i].file))
        }
        const listText = inputNames.map((n) => `file '${n}'`).join('\n')
        await ff.writeFile('list.txt', new TextEncoder().encode(listText))
        const code = await ff.exec([
          '-f', 'concat',
          '-safe', '0',
          '-i', 'list.txt',
          '-c', 'copy',
          outputName,
        ])
        if (code !== 0) {
          throw new Error(t('media.errConcat'))
        }
        const data = await ff.readFile(outputName)
        if (typeof data === 'string') throw new Error(t('media.errUnexpectedString'))
        const mime = inferMime(outputName)
        const blob = new Blob([new Uint8Array(data)], { type: mime })
        setResult(blob, `concat.${ext}`, mime)
      } finally {
        for (const n of inputNames) {
          try { await ff.deleteFile(n) } catch { /* ignore */ }
        }
        try { await ff.deleteFile('list.txt') } catch { /* ignore */ }
        try { await ff.deleteFile(outputName) } catch { /* ignore */ }
      }
    })

  const doExtractAudio = () =>
    runOp(async () => {
      if (!selected) throw new Error(t('media.errSelectFirst'))
      const ext = getExt(selected.file.name)
      const inputName = `input.${ext}`
      const outputName = `audio.${audioFormat}`
      // mp3 needs libmp3lame; aac uses native AAC encoder.
      const audioCodec = audioFormat === 'mp3' ? 'libmp3lame' : 'aac'
      const { blob } = await run({
        inputs: [{ name: inputName, data: selected.file }],
        command: [
          '-i', inputName,
          '-vn',
          '-c:a', audioCodec,
          '-b:a', '192k',
          outputName,
        ],
        outputName,
        outputMime: inferMime(outputName),
        onProgress: (r) =>
          setStatus({ kind: 'processing', progress: r }),
      })
      setResult(
        blob,
        `${stripExt(selected.file.name)}.${audioFormat}`,
        inferMime(outputName),
      )
    })

  const doConvert = () =>
    runOp(async () => {
      if (!selected) throw new Error(t('media.errSelectFirst'))
      const inputExt = getExt(selected.file.name)
      const inputName = `input.${inputExt}`
      const outputName = `out.${convertFormat}`
      let cmd: string[]
      if (convertFormat === 'mp4') {
        cmd = [
          '-i', inputName,
          '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
          '-c:a', 'aac', '-b:a', '128k',
          outputName,
        ]
      } else {
        // gif: 10fps, max 480px wide, palette generation skipped for simplicity
        cmd = [
          '-i', inputName,
          '-vf', 'fps=10,scale=480:-1:flags=lanczos',
          '-an',
          outputName,
        ]
      }
      const { blob } = await run({
        inputs: [{ name: inputName, data: selected.file }],
        command: cmd,
        outputName,
        outputMime: inferMime(outputName),
        onProgress: (r) =>
          setStatus({ kind: 'processing', progress: r }),
      })
      setResult(
        blob,
        `${stripExt(selected.file.name)}.${convertFormat}`,
        inferMime(outputName),
      )
    })

  // ─── Render ─────────────────────────────────────────────────────────────

  const busy = status.kind !== 'idle'
  const statusLabel =
    status.kind === 'loading_ffmpeg'
      ? t('media.loadingCore')
      : status.kind === 'processing'
        ? t('media.processing', { percent: (status.progress * 100).toFixed(0) })
        : ''

  return (
    <div className="mx-auto max-w-7xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.media.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('media.description')}</p>
      </header>

      <DropZone onFiles={addFiles} />

      {items.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`cursor-pointer rounded-lg ring-2 transition-all ${
                selectedId === item.id ? 'ring-primary' : 'ring-transparent'
              }`}
            >
              <MediaCard
                item={item}
                onUpdate={(patch) => updateItem(item.id, patch)}
                onRemove={() => removeItem(item.id)}
              />
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <Tabs defaultValue="trim" className="mt-8">
          <TabsList>
            <TabsTrigger value="trim">{t('media.tabTrim')}</TabsTrigger>
            <TabsTrigger value="concat">{t('media.tabConcat')}</TabsTrigger>
            <TabsTrigger value="audio">{t('media.tabExtractAudio')}</TabsTrigger>
            <TabsTrigger value="convert">{t('media.tabConvert')}</TabsTrigger>
          </TabsList>

          <TabsContent value="trim" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">{t('media.trimDescription')}</p>
            <ActiveSelectionHint selected={selected} />
            <Button onClick={doTrim} disabled={busy || !selected}>
              <Play className="h-4 w-4" />
              {t('media.trimRun')}
            </Button>
          </TabsContent>

          <TabsContent value="concat" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('media.concatDescription')}
              <br />
              <span className="inline-flex items-center gap-1 text-amber-500">
                <AlertTriangle className="h-3 w-3" /> {t('media.concatWarning')}
              </span>
            </p>
            <Button onClick={doConcat} disabled={busy || items.length < 2}>
              <Play className="h-4 w-4" />
              {t('media.concatRun', { count: items.length })}
            </Button>
          </TabsContent>

          <TabsContent value="audio" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">{t('media.audioDescription')}</p>
            <ActiveSelectionHint selected={selected} />
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground">{t('media.audioFormat')}</Label>
              <SegmentedChoice
                value={audioFormat}
                options={[
                  { value: 'mp3', label: 'MP3 (192kbps)' },
                  { value: 'aac', label: 'AAC (192kbps)' },
                ]}
                onChange={setAudioFormat}
              />
            </div>
            <Button onClick={doExtractAudio} disabled={busy || !selected}>
              <Play className="h-4 w-4" />
              {t('media.audioRun')}
            </Button>
          </TabsContent>

          <TabsContent value="convert" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">{t('media.convertDescription')}</p>
            <ActiveSelectionHint selected={selected} />
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground">{t('media.convertFormat')}</Label>
              <SegmentedChoice
                value={convertFormat}
                options={[
                  { value: 'mp4', label: 'MP4 (H.264 + AAC)' },
                  { value: 'gif', label: 'GIF (10fps, 480px)' },
                ]}
                onChange={setConvertFormat}
              />
            </div>
            <Button onClick={doConvert} disabled={busy || !selected}>
              <Play className="h-4 w-4" />
              {t('media.convertRun')}
            </Button>
          </TabsContent>
        </Tabs>
      )}

      {busy && (
        <div className="mt-6 flex items-center gap-2 rounded-md border border-border bg-card/50 px-4 py-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{statusLabel}</span>
          {status.kind === 'processing' && (
            <div className="ml-auto h-1.5 w-40 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${status.progress * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {output && !busy && (
        <div className="mt-6">
          <OutputView
            result={output}
            onClear={() => {
              URL.revokeObjectURL(output.url)
              setOutput(null)
            }}
          />
        </div>
      )}
    </div>
  )
}

function ActiveSelectionHint({ selected }: { selected: MediaItem | null }) {
  const { t } = useTranslation()
  if (!selected) {
    return <p className="text-xs text-muted-foreground">{t('media.selectionNone')}</p>
  }
  return (
    <p className="text-xs text-muted-foreground">
      {t('media.selectionLabel')} <span className="font-mono">{selected.file.name}</span>
    </p>
  )
}

function SegmentedChoice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-md border border-input bg-transparent text-sm">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 transition-colors ${
            value === opt.value
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
