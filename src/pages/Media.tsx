import { useEffect, useState } from 'react'
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
      toast.success('处理完成')
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
      if (!selected) throw new Error('请先选择一个文件')
      const ext = getExt(selected.file.name)
      const inputName = `input.${ext}`
      const outputName = `trim.${ext}`
      const outSec = selected.outSec ?? selected.duration ?? 0
      if (outSec <= selected.inSec) {
        throw new Error('out 必须大于 in')
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
      if (items.length < 2) throw new Error('需要至少 2 个文件')
      const ff = await getFFmpeg()
      const ext = getExt(items[0].file.name)
      // Demand uniform extension; concat demuxer needs matching codecs/containers.
      if (items.some((i) => getExt(i.file.name) !== ext)) {
        throw new Error(
          '所有文件扩展名必须相同（concat demuxer 要求容器与编码一致）',
        )
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
          throw new Error(
            'concat 失败：通常是因为各文件的编码或封装不一致。先用 Convert 统一格式再拼接。',
          )
        }
        const data = await ff.readFile(outputName)
        if (typeof data === 'string') throw new Error('意外的字符串输出')
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
      if (!selected) throw new Error('请先选择一个文件')
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
      if (!selected) throw new Error('请先选择一个文件')
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
      ? '加载 ffmpeg.wasm（首次约 30MB，加载完后续秒进）…'
      : status.kind === 'processing'
        ? `处理中… ${(status.progress * 100).toFixed(0)}%`
        : ''

  return (
    <div className="mx-auto max-w-7xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Media</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          剪辑、拼接、提取音轨、格式转换。基于 ffmpeg.wasm，所有处理在浏览器本地完成。
        </p>
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
            <TabsTrigger value="trim">剪辑</TabsTrigger>
            <TabsTrigger value="concat">拼接</TabsTrigger>
            <TabsTrigger value="audio">提取音轨</TabsTrigger>
            <TabsTrigger value="convert">格式转换</TabsTrigger>
          </TabsList>

          <TabsContent value="trim" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              剪辑当前选中文件的 in → out 段。使用 <code>-c copy</code> 不重编码，
              速度快，但切点会对齐到最近的关键帧。
            </p>
            <ActiveSelectionHint selected={selected} />
            <Button onClick={doTrim} disabled={busy || !selected}>
              <Play className="h-4 w-4" />
              剪辑并导出
            </Button>
          </TabsContent>

          <TabsContent value="concat" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              按当前列表顺序拼接所有文件。
              <br />
              <span className="inline-flex items-center gap-1 text-amber-500">
                <AlertTriangle className="h-3 w-3" /> 要求所有文件容器和编码一致
                ；in/out 标记不生效（要先剪后拼，请分别 trim 后再拼接）。
              </span>
            </p>
            <Button onClick={doConcat} disabled={busy || items.length < 2}>
              <Play className="h-4 w-4" />
              拼接并导出 ({items.length} 个文件)
            </Button>
          </TabsContent>

          <TabsContent value="audio" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              从当前选中文件提取整段音轨。
            </p>
            <ActiveSelectionHint selected={selected} />
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground">格式：</Label>
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
              提取并导出
            </Button>
          </TabsContent>

          <TabsContent value="convert" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              转换当前选中文件的格式。重编码，**会比较慢**（几十秒到几分钟，看视频长度）。
            </p>
            <ActiveSelectionHint selected={selected} />
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground">目标格式：</Label>
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
              转换并导出
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
  if (!selected) {
    return (
      <p className="text-xs text-muted-foreground">未选中文件 — 点上面的卡片选中</p>
    )
  }
  return (
    <p className="text-xs text-muted-foreground">
      选中：<span className="font-mono">{selected.file.name}</span>
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
