import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Play, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { DropZone } from '@/components/media/DropZone'
import { MediaCard, type MediaItem } from '@/components/media/MediaCard'
import { OutputView, type OutputResult } from '@/components/media/OutputView'
import { fetchFile, getFFmpeg, inferMime, run } from '@/lib/ffmpeg'
import {
  buildTrimArgs,
  buildCompressArgs,
  buildResizeArgs,
  buildMuteArgs,
  buildTransformArgs,
  buildThumbnailArgs,
  buildExtractAudioArgs,
  buildLoudnormArgs,
  buildConvertArgs,
  buildGifPalettePassArgs,
  buildGifRenderArgs,
  buildConcatReencodeArgs,
  type Transform,
} from '@/lib/media-ops'

type Status =
  | { kind: 'idle' }
  | { kind: 'loading_ffmpeg' }
  | { kind: 'processing'; progress: number }

const stripExt = (name: string) => name.replace(/\.[^./]+$/, '')
const getExt = (name: string) => name.split('.').pop()?.toLowerCase() ?? 'bin'

type AudioCodec = 'libmp3lame' | 'aac' | 'flac' | 'pcm_s16le'
const AUDIO_EXT: Record<AudioCodec, string> = {
  libmp3lame: 'mp3',
  aac: 'aac',
  flac: 'flac',
  pcm_s16le: 'wav',
}

export function MediaPage() {
  const { t } = useTranslation()
  const [items, setItems] = useState<MediaItem[]>([])
  const [output, setOutput] = useState<OutputResult | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Per-op option state.
  const [crf, setCrf] = useState(28)
  const [preset, setPreset] = useState('medium')
  const [resizeWidth, setResizeWidth] = useState(1280)
  const [resizeFps, setResizeFps] = useState<number | ''>('')
  const [convertTarget, setConvertTarget] = useState<'mp4' | 'webm' | 'mov' | 'mkv'>('mp4')
  const [gifFps, setGifFps] = useState(12)
  const [gifWidth, setGifWidth] = useState(480)
  const [audioCodec, setAudioCodec] = useState<AudioCodec>('libmp3lame')
  const [transform, setTransform] = useState<Transform>('rotate90')
  const [thumbSec, setThumbSec] = useState(0)

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
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
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
    setOutput({ url: URL.createObjectURL(blob), filename, mime, size: blob.size })
  }

  const selected = items.find((i) => i.id === selectedId) ?? null

  const runOp = async (op: () => Promise<void>) => {
    if (status.kind !== 'idle') return
    setStatus({ kind: 'loading_ffmpeg' })
    try {
      await getFFmpeg()
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

  const onProgress = (r: number) => setStatus({ kind: 'processing', progress: r })

  // Single-input, single-output op via the shared `run` helper.
  const runSingle = async (
    buildArgs: (io: { input: string; output: string }) => string[],
    outExt: string,
    outSuffix: string,
  ) => {
    if (!selected) throw new Error(t('media.errSelectFirst'))
    const input = `input.${getExt(selected.file.name)}`
    const output = `out.${outExt}`
    const { blob } = await run({
      inputs: [{ name: input, data: selected.file }],
      command: buildArgs({ input, output }),
      outputName: output,
      outputMime: inferMime(output),
      onProgress,
    })
    setResult(blob, `${stripExt(selected.file.name)}${outSuffix}.${outExt}`, inferMime(output))
  }

  // ── Operations ────────────────────────────────────────────────────────────

  const doTrim = () =>
    runOp(async () => {
      if (!selected) throw new Error(t('media.errSelectFirst'))
      const outSec = selected.outSec ?? selected.duration ?? 0
      if (outSec <= selected.inSec) throw new Error(t('media.errOutAfterIn'))
      const ext = getExt(selected.file.name)
      await runSingle(
        ({ input, output }) =>
          buildTrimArgs({ input, output, startSec: selected.inSec, endSec: outSec }),
        ext,
        '_trim',
      )
    })

  const doCompress = () =>
    runOp(() =>
      runSingle(
        ({ input, output }) => buildCompressArgs({ input, output, crf, preset }),
        'mp4',
        '_compressed',
      ),
    )

  const doResize = () =>
    runOp(() =>
      runSingle(
        ({ input, output }) =>
          buildResizeArgs({
            input,
            output,
            width: resizeWidth,
            fps: resizeFps === '' ? null : resizeFps,
          }),
        'mp4',
        `_${resizeWidth}w`,
      ),
    )

  const doMute = () =>
    runOp(() => runSingle(({ input, output }) => buildMuteArgs({ input, output }), 'mp4', '_muted'))

  const doTransform = () =>
    runOp(() =>
      runSingle(
        ({ input, output }) => buildTransformArgs({ input, output, transform }),
        'mp4',
        `_${transform}`,
      ),
    )

  const doConvert = () =>
    runOp(() =>
      runSingle(
        ({ input, output }) => buildConvertArgs({ input, output, target: convertTarget }),
        convertTarget,
        '',
      ),
    )

  const doExtractAudio = () =>
    runOp(() =>
      runSingle(
        ({ input, output }) => buildExtractAudioArgs({ input, output, codec: audioCodec }),
        AUDIO_EXT[audioCodec],
        '',
      ),
    )

  const doLoudnorm = () =>
    runOp(() =>
      runSingle(({ input, output }) => buildLoudnormArgs({ input, output }), 'm4a', '_normalized'),
    )

  const doThumbnail = () =>
    runOp(() =>
      runSingle(
        ({ input, output }) => buildThumbnailArgs({ input, output, atSec: thumbSec, width: 0 }),
        'png',
        `_frame`,
      ),
    )

  // GIF needs two passes sharing a palette file → custom runner.
  const doGif = () =>
    runOp(async () => {
      if (!selected) throw new Error(t('media.errSelectFirst'))
      const ff = await getFFmpeg()
      const input = `input.${getExt(selected.file.name)}`
      const palette = 'palette.png'
      const output = 'out.gif'
      try {
        await ff.writeFile(input, await fetchFile(selected.file))
        const p1 = await ff.exec(buildGifPalettePassArgs({ input, palette, fps: gifFps, width: gifWidth }))
        if (p1 !== 0) throw new Error(t('media.errGif'))
        const p2 = await ff.exec(
          buildGifRenderArgs({ input, palette, output, fps: gifFps, width: gifWidth }),
        )
        if (p2 !== 0) throw new Error(t('media.errGif'))
        const data = await ff.readFile(output)
        if (typeof data === 'string') throw new Error(t('media.errUnexpectedString'))
        const blob = new Blob([new Uint8Array(data)], { type: 'image/gif' })
        setResult(blob, `${stripExt(selected.file.name)}.gif`, 'image/gif')
      } finally {
        for (const n of [input, palette, output]) {
          try {
            await ff.deleteFile(n)
          } catch {
            /* ignore */
          }
        }
      }
    })

  // Concat re-encodes to a common format so mixed codecs/containers work.
  const doConcat = () =>
    runOp(async () => {
      if (items.length < 2) throw new Error(t('media.errNeedTwoFiles'))
      const ff = await getFFmpeg()
      const hasAudio = items.every((i) => !i.isAudio) // video set → assume audio tracks
      const inputNames = items.map((it, i) => `in${i}.${getExt(it.file.name)}`)
      const output = 'concat.mp4'
      try {
        for (let i = 0; i < items.length; i++) {
          await ff.writeFile(inputNames[i], await fetchFile(items[i].file))
        }
        const args = buildConcatReencodeArgs({ inputs: inputNames, output, hasAudio: true })
        let code = await ff.exec(args)
        if (code !== 0) {
          // Retry without audio mapping (some inputs may lack an audio track).
          code = await ff.exec(buildConcatReencodeArgs({ inputs: inputNames, output, hasAudio: false }))
        }
        if (code !== 0) throw new Error(t('media.errConcat'))
        void hasAudio
        const data = await ff.readFile(output)
        if (typeof data === 'string') throw new Error(t('media.errUnexpectedString'))
        const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' })
        setResult(blob, 'concat.mp4', 'video/mp4')
      } finally {
        for (const n of [...inputNames, output]) {
          try {
            await ff.deleteFile(n)
          } catch {
            /* ignore */
          }
        }
      }
    })

  // ── Render ──────────────────────────────────────────────────────────────

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
          <TabsList className="flex-wrap">
            <TabsTrigger value="trim">{t('media.tabTrim')}</TabsTrigger>
            <TabsTrigger value="concat">{t('media.tabConcat')}</TabsTrigger>
            <TabsTrigger value="compress">{t('media.tabCompress')}</TabsTrigger>
            <TabsTrigger value="resize">{t('media.tabResize')}</TabsTrigger>
            <TabsTrigger value="convert">{t('media.tabConvert')}</TabsTrigger>
            <TabsTrigger value="gif">{t('media.tabGif')}</TabsTrigger>
            <TabsTrigger value="transform">{t('media.tabTransform')}</TabsTrigger>
            <TabsTrigger value="frame">{t('media.tabFrame')}</TabsTrigger>
            <TabsTrigger value="audio">{t('media.tabAudio')}</TabsTrigger>
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
            <p className="text-sm text-muted-foreground">{t('media.concatDescription')}</p>
            <Button onClick={doConcat} disabled={busy || items.length < 2}>
              <Play className="h-4 w-4" />
              {t('media.concatRun', { count: items.length })}
            </Button>
          </TabsContent>

          <TabsContent value="compress" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">{t('media.compressDescription')}</p>
            <ActiveSelectionHint selected={selected} />
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">{t('media.crf')}</Label>
                <input
                  type="range"
                  min={18}
                  max={34}
                  value={crf}
                  onChange={(e) => setCrf(Number(e.target.value))}
                  className="w-40 accent-primary"
                />
                <span className="w-6 font-mono text-xs">{crf}</span>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">{t('media.preset')}</Label>
                <SegmentedChoice
                  value={preset}
                  options={[
                    { value: 'ultrafast', label: 'ultrafast' },
                    { value: 'veryfast', label: 'veryfast' },
                    { value: 'medium', label: 'medium' },
                    { value: 'slow', label: 'slow' },
                  ]}
                  onChange={setPreset}
                />
              </div>
            </div>
            <Button onClick={doCompress} disabled={busy || !selected}>
              <Play className="h-4 w-4" />
              {t('media.compressRun')}
            </Button>
          </TabsContent>

          <TabsContent value="resize" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">{t('media.resizeDescription')}</p>
            <ActiveSelectionHint selected={selected} />
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">{t('media.width')}</Label>
                <SegmentedChoice
                  value={String(resizeWidth)}
                  options={[
                    { value: '640', label: '640' },
                    { value: '854', label: '854' },
                    { value: '1280', label: '1280' },
                    { value: '1920', label: '1920' },
                  ]}
                  onChange={(v) => setResizeWidth(Number(v))}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">{t('media.fpsOptional')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={resizeFps}
                  onChange={(e) => setResizeFps(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="—"
                  className="h-8 w-20 font-mono text-sm"
                />
              </div>
              <Button size="sm" variant="ghost" onClick={doMute} disabled={busy || !selected}>
                {t('media.muteRun')}
              </Button>
            </div>
            <Button onClick={doResize} disabled={busy || !selected}>
              <Play className="h-4 w-4" />
              {t('media.resizeRun')}
            </Button>
          </TabsContent>

          <TabsContent value="convert" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">{t('media.convertDescription')}</p>
            <ActiveSelectionHint selected={selected} />
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">{t('media.convertFormat')}</Label>
              <SegmentedChoice
                value={convertTarget}
                options={[
                  { value: 'mp4', label: 'MP4 (H.264)' },
                  { value: 'webm', label: 'WebM (VP9)' },
                  { value: 'mov', label: 'MOV' },
                  { value: 'mkv', label: 'MKV' },
                ]}
                onChange={setConvertTarget}
              />
            </div>
            <Button onClick={doConvert} disabled={busy || !selected}>
              <Play className="h-4 w-4" />
              {t('media.convertRun')}
            </Button>
          </TabsContent>

          <TabsContent value="gif" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">{t('media.gifDescription')}</p>
            <ActiveSelectionHint selected={selected} />
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">{t('media.fps')}</Label>
                <SegmentedChoice
                  value={String(gifFps)}
                  options={[
                    { value: '8', label: '8' },
                    { value: '12', label: '12' },
                    { value: '15', label: '15' },
                    { value: '24', label: '24' },
                  ]}
                  onChange={(v) => setGifFps(Number(v))}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">{t('media.width')}</Label>
                <SegmentedChoice
                  value={String(gifWidth)}
                  options={[
                    { value: '320', label: '320' },
                    { value: '480', label: '480' },
                    { value: '640', label: '640' },
                  ]}
                  onChange={(v) => setGifWidth(Number(v))}
                />
              </div>
            </div>
            <Button onClick={doGif} disabled={busy || !selected}>
              <Play className="h-4 w-4" />
              {t('media.gifRun')}
            </Button>
          </TabsContent>

          <TabsContent value="transform" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">{t('media.transformDescription')}</p>
            <ActiveSelectionHint selected={selected} />
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">{t('media.transform')}</Label>
              <SegmentedChoice
                value={transform}
                options={[
                  { value: 'rotate90', label: '⟳ 90°' },
                  { value: 'rotate180', label: '180°' },
                  { value: 'rotate270', label: '⟲ 90°' },
                  { value: 'flipH', label: t('media.flipH') },
                  { value: 'flipV', label: t('media.flipV') },
                ]}
                onChange={setTransform}
              />
            </div>
            <Button onClick={doTransform} disabled={busy || !selected}>
              <Play className="h-4 w-4" />
              {t('media.transformRun')}
            </Button>
          </TabsContent>

          <TabsContent value="frame" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">{t('media.frameDescription')}</p>
            <ActiveSelectionHint selected={selected} />
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">{t('media.atSecond')}</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={thumbSec}
                onChange={(e) => setThumbSec(Math.max(0, Number(e.target.value)))}
                className="h-8 w-24 font-mono text-sm"
              />
            </div>
            <Button onClick={doThumbnail} disabled={busy || !selected}>
              <Play className="h-4 w-4" />
              {t('media.frameRun')}
            </Button>
          </TabsContent>

          <TabsContent value="audio" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">{t('media.audioDescription')}</p>
            <ActiveSelectionHint selected={selected} />
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">{t('media.audioFormat')}</Label>
                <SegmentedChoice
                  value={audioCodec}
                  options={[
                    { value: 'libmp3lame', label: 'MP3' },
                    { value: 'aac', label: 'AAC' },
                    { value: 'flac', label: 'FLAC' },
                    { value: 'pcm_s16le', label: 'WAV' },
                  ]}
                  onChange={(v) => setAudioCodec(v as AudioCodec)}
                />
              </div>
              <Button size="sm" variant="ghost" onClick={doLoudnorm} disabled={busy || !selected}>
                {t('media.loudnormRun')}
              </Button>
            </div>
            <Button onClick={doExtractAudio} disabled={busy || !selected}>
              <Play className="h-4 w-4" />
              {t('media.audioRun')}
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

      {!busy && (
        <p className="mt-4 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <AlertTriangle className="h-3 w-3" /> {t('media.firstRunHint')}
        </p>
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
    <div className="flex flex-wrap rounded-md border border-input bg-transparent text-sm">
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
