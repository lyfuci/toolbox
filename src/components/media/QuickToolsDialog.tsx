import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Download, Upload, Play } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { getFFmpeg, fetchFile, inferMime, run } from '@/lib/ffmpeg'
import {
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
  type Transform,
} from '@/lib/media-ops'

/**
 * Quick single-file operations — the former "operation tabs", folded into a
 * dialog so the timeline editor stays the primary view. Operates on ONE file
 * end-to-end (pick → run → download); never touches the timeline project.
 * Reuses the unit-tested media-ops builders.
 */

type Op =
  | 'compress'
  | 'convert'
  | 'gif'
  | 'audio'
  | 'loudnorm'
  | 'resize'
  | 'mute'
  | 'rotate'
  | 'frame'

const OPS: Op[] = ['compress', 'convert', 'gif', 'audio', 'loudnorm', 'resize', 'mute', 'rotate', 'frame']

type AudioCodec = 'libmp3lame' | 'aac' | 'flac' | 'pcm_s16le'
const AUDIO_EXT: Record<AudioCodec, string> = { libmp3lame: 'mp3', aac: 'aac', flac: 'flac', pcm_s16le: 'wav' }

const stripExt = (name: string) => name.replace(/\.[^./]+$/, '')
const getExt = (name: string) => name.split('.').pop()?.toLowerCase() ?? 'bin'

type Result = { url: string; filename: string; size: number } | null
type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'running'; progress: number }

export function QuickToolsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation()
  const [file, setFile] = useState<File | null>(null)
  const [op, setOp] = useState<Op>('compress')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [result, setResult] = useState<Result>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Option state.
  const [crf, setCrf] = useState(28)
  const [convertTarget, setConvertTarget] = useState<'mp4' | 'webm' | 'mov' | 'mkv'>('mp4')
  const [resizeWidth, setResizeWidth] = useState(1280)
  const [audioCodec, setAudioCodec] = useState<AudioCodec>('libmp3lame')
  const [transform, setTransform] = useState<Transform>('rotate90')
  const [thumbSec, setThumbSec] = useState(0)

  useEffect(() => {
    return () => {
      if (result) URL.revokeObjectURL(result.url)
    }
  }, [result])

  const clearResult = () => {
    setResult((r) => {
      if (r) URL.revokeObjectURL(r.url)
      return null
    })
  }

  const busy = status.kind !== 'idle'

  const runOp = async (fn: () => Promise<{ blob: Blob; filename: string }>) => {
    if (!file) {
      toast.error(t('media.quick.errPickFile'))
      return
    }
    if (busy) return
    clearResult()
    setStatus({ kind: 'loading' })
    try {
      await getFFmpeg()
      setStatus({ kind: 'running', progress: 0 })
      const { blob, filename } = await fn()
      setResult({ url: URL.createObjectURL(blob), filename, size: blob.size })
      toast.success(t('media.processingDone'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e), { duration: 8000 })
    } finally {
      setStatus({ kind: 'idle' })
    }
  }

  const onProgress = (r: number) => setStatus({ kind: 'running', progress: r })

  // Single-input/output op via the shared `run` helper.
  const single = (build: (io: { input: string; output: string }) => string[], outExt: string, suffix: string) =>
    runOp(async () => {
      const input = `input.${getExt(file!.name)}`
      const output = `out.${outExt}`
      const { blob } = await run({
        inputs: [{ name: input, data: file! }],
        command: build({ input, output }),
        outputName: output,
        outputMime: inferMime(output),
        onProgress,
      })
      return { blob, filename: `${stripExt(file!.name)}${suffix}.${outExt}` }
    })

  const handlers: Record<Op, () => void> = {
    compress: () => single(({ input, output }) => buildCompressArgs({ input, output, crf, preset: 'medium' }), 'mp4', '_compressed'),
    convert: () => single(({ input, output }) => buildConvertArgs({ input, output, target: convertTarget }), convertTarget, ''),
    audio: () => single(({ input, output }) => buildExtractAudioArgs({ input, output, codec: audioCodec }), AUDIO_EXT[audioCodec], ''),
    loudnorm: () => single(({ input, output }) => buildLoudnormArgs({ input, output }), 'm4a', '_normalized'),
    resize: () => single(({ input, output }) => buildResizeArgs({ input, output, width: resizeWidth }), 'mp4', `_${resizeWidth}w`),
    mute: () => single(({ input, output }) => buildMuteArgs({ input, output }), 'mp4', '_muted'),
    rotate: () => single(({ input, output }) => buildTransformArgs({ input, output, transform }), 'mp4', `_${transform}`),
    frame: () => single(({ input, output }) => buildThumbnailArgs({ input, output, atSec: thumbSec, width: 0 }), 'png', '_frame'),
    gif: () =>
      runOp(async () => {
        const ff = await getFFmpeg()
        const input = `input.${getExt(file!.name)}`
        const palette = 'palette.png'
        const output = 'out.gif'
        try {
          await ff.writeFile(input, await fetchFile(file!))
          if ((await ff.exec(buildGifPalettePassArgs({ input, palette, fps: 12, width: 480 }))) !== 0)
            throw new Error(t('media.errGif'))
          if ((await ff.exec(buildGifRenderArgs({ input, palette, output, fps: 12, width: 480 }))) !== 0)
            throw new Error(t('media.errGif'))
          const data = await ff.readFile(output)
          if (typeof data === 'string') throw new Error(t('media.errUnexpectedString'))
          return { blob: new Blob([new Uint8Array(data)], { type: 'image/gif' }), filename: `${stripExt(file!.name)}.gif` }
        } finally {
          for (const n of [input, palette, output]) {
            try {
              await ff.deleteFile(n)
            } catch {
              /* ignore */
            }
          }
        }
      }),
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('media.quick.title')}</DialogTitle>
          <DialogDescription>{t('media.quick.description')}</DialogDescription>
        </DialogHeader>

        {/* File picker */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 rounded-md border border-dashed border-input px-3 py-2 text-sm text-muted-foreground hover:bg-accent/30"
        >
          <Upload className="h-4 w-4" />
          {file ? <span className="font-mono text-foreground">{file.name}</span> : t('media.quick.pickFile')}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*,audio/*"
          hidden
          onChange={(e) => {
            if (e.target.files?.[0]) {
              setFile(e.target.files[0])
              clearResult()
            }
            e.target.value = ''
          }}
        />

        {/* Op selector */}
        <div className="flex flex-wrap gap-1.5">
          {OPS.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOp(o)}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                op === o ? 'border-foreground/40 bg-accent text-accent-foreground' : 'border-input text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(`media.quick.op.${o}`)}
            </button>
          ))}
        </div>

        {/* Per-op options */}
        <div className="min-h-[2.25rem] text-sm">
          {op === 'compress' && (
            <Row label={t('media.crf')}>
              <input type="range" min={18} max={34} value={crf} onChange={(e) => setCrf(Number(e.target.value))} className="w-40 accent-primary" />
              <span className="w-6 font-mono text-xs">{crf}</span>
            </Row>
          )}
          {op === 'convert' && (
            <Row label={t('media.convertFormat')}>
              <Seg value={convertTarget} onChange={setConvertTarget} options={[['mp4', 'MP4'], ['webm', 'WebM'], ['mov', 'MOV'], ['mkv', 'MKV']]} />
            </Row>
          )}
          {op === 'resize' && (
            <Row label={t('media.width')}>
              <Seg value={String(resizeWidth)} onChange={(v) => setResizeWidth(Number(v))} options={[['640', '640'], ['1280', '1280'], ['1920', '1920']]} />
            </Row>
          )}
          {op === 'audio' && (
            <Row label={t('media.audioFormat')}>
              <Seg value={audioCodec} onChange={(v) => setAudioCodec(v as AudioCodec)} options={[['libmp3lame', 'MP3'], ['aac', 'AAC'], ['flac', 'FLAC'], ['pcm_s16le', 'WAV']]} />
            </Row>
          )}
          {op === 'rotate' && (
            <Row label={t('media.transform')}>
              <Seg
                value={transform}
                onChange={(v) => setTransform(v as Transform)}
                options={[['rotate90', '⟳90°'], ['rotate180', '180°'], ['rotate270', '⟲90°'], ['flipH', t('media.flipH')], ['flipV', t('media.flipV')]]}
              />
            </Row>
          )}
          {op === 'frame' && (
            <Row label={t('media.atSecond')}>
              <Input type="number" min={0} step={0.5} value={thumbSec} onChange={(e) => setThumbSec(Math.max(0, Number(e.target.value)))} className="h-8 w-24 font-mono text-sm" />
            </Row>
          )}
          {op === 'gif' && <p className="text-xs text-muted-foreground">{t('media.gifDescription')}</p>}
          {op === 'mute' && <p className="text-xs text-muted-foreground">{t('media.quick.muteHint')}</p>}
          {op === 'loudnorm' && <p className="text-xs text-muted-foreground">{t('media.quick.loudnormHint')}</p>}
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handlers[op]} disabled={busy || !file}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
            {t('media.quick.run')}
          </Button>
          {status.kind === 'running' && (
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${status.progress * 100}%` }} />
            </div>
          )}
          {status.kind === 'loading' && <span className="text-xs text-muted-foreground">{t('media.loadingCore')}</span>}
        </div>

        {result && (
          <a
            href={result.url}
            download={result.filename}
            className="flex items-center gap-2 rounded-md border border-border bg-card/40 px-3 py-2 text-sm hover:bg-accent/30"
          >
            <Download className="h-4 w-4 text-primary" />
            <span className="font-mono">{result.filename}</span>
            <span className="ml-auto text-xs text-muted-foreground">{(result.size / 1024 / 1024).toFixed(2)} MB</span>
          </a>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex flex-wrap rounded-md border border-input text-sm">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`px-3 py-1 transition-colors ${value === v ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
