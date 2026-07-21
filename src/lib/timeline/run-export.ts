import { getFFmpeg, fetchFile } from '@/lib/ffmpeg'
import { buildTimelineExport } from './export-graph'
import type { Project } from './model'

export type ExportInput = { sourceId: string; file: File; hasAudio: boolean; hasVideo: boolean }

/**
 * Browser export: composite the whole timeline into one MP4 via ffmpeg.wasm.
 * Uses the same pure builder validated against system ffmpeg in tests. Only the
 * sources actually referenced by a clip are written to the virtual FS.
 */
export async function runTimelineExport(
  project: Project,
  inputs: ExportInput[],
  opts: {
    crf?: number
    preset?: string
    rangeStart?: number
    rangeEnd?: number
    onProgress?: (r: number) => void
    onLog?: (line: { type: string; message: string }) => void
  } = {},
): Promise<Blob> {
  const used = new Set<string>()
  for (const tr of project.tracks) for (const c of tr.clips) used.add(c.sourceId)
  const inputFiles = inputs
    .filter((i) => used.has(i.sourceId))
    .map((i, idx) => ({ ...i, name: `in${idx}.${extOf(i.file.name)}` }))

  if (inputFiles.length === 0) throw new Error('emptyTimeline')

  const output = 'timeline.mp4'
  const { args } = buildTimelineExport(
    project,
    inputFiles.map((f) => ({ sourceId: f.sourceId, name: f.name, hasAudio: f.hasAudio, hasVideo: f.hasVideo })),
    { output, crf: opts.crf, preset: opts.preset, rangeStart: opts.rangeStart, rangeEnd: opts.rangeEnd },
  )

  const ff = await getFFmpeg()
  const handleProgress = ({ progress }: { progress: number }) =>
    opts.onProgress?.(Math.max(0, Math.min(1, progress)))
  if (opts.onProgress) ff.on('progress', handleProgress)
  const handleLog = (line: { type: string; message: string }) => opts.onLog?.(line)
  if (opts.onLog) ff.on('log', handleLog)
  try {
    for (const f of inputFiles) await ff.writeFile(f.name, await fetchFile(f.file))
    const code = await ff.exec(args)
    if (code !== 0) throw new Error(`ffmpeg exited ${code}`)
    const data = await ff.readFile(output)
    if (typeof data === 'string') throw new Error('unexpected string output')
    return new Blob([new Uint8Array(data)], { type: 'video/mp4' })
  } finally {
    if (opts.onProgress) ff.off('progress', handleProgress)
    if (opts.onLog) ff.off('log', handleLog)
    for (const f of inputFiles) {
      try {
        await ff.deleteFile(f.name)
      } catch {
        /* ignore */
      }
    }
    try {
      await ff.deleteFile(output)
    } catch {
      /* ignore */
    }
  }
}

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? 'bin'
}
