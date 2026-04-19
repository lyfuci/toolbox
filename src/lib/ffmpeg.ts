import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

// Pin the core version. Update intentionally; CDN files are immutable per version.
const CORE_VERSION = '0.12.6'
// Use the ESM build: @ffmpeg/ffmpeg's worker is spawned as `type: "module"`,
// where `importScripts()` always throws. Its fallback path then `await import()`s
// the coreURL, which only works on the ESM build (UMD throws "failed to import
// ffmpeg-core.js"). The ESM core also needs `application/javascript` MIME, not
// `text/javascript`, for the dynamic import to succeed under strict module rules.
const CORE_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@${CORE_VERSION}/dist/esm`

let instance: FFmpeg | null = null
let loadPromise: Promise<FFmpeg> | null = null

export type LogLine = { type: string; message: string }

/**
 * Lazily load the multi-threaded ffmpeg.wasm core. Requires the page to be
 * cross-origin isolated (COOP: same-origin + COEP: require-corp).
 */
export async function getFFmpeg(opts?: {
  onLog?: (line: LogLine) => void
}): Promise<FFmpeg> {
  if (instance) return instance
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const ff = new FFmpeg()
    if (opts?.onLog) ff.on('log', opts.onLog)

    await ff.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'application/javascript'),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      workerURL: await toBlobURL(
        `${CORE_BASE}/ffmpeg-core.worker.js`,
        'application/javascript',
      ),
    })

    instance = ff
    return ff
  })()

  return loadPromise
}

export { fetchFile }

export type ProgressHandler = (ratio: number) => void

/**
 * Run an ffmpeg command. Inputs are loaded into the virtual FS, the command
 * runs, the output file is read back as a Blob, then everything is cleaned up.
 *
 * Returns the output Blob plus any captured stderr lines (useful for surfacing
 * "moov atom not found" style errors).
 */
export async function run(args: {
  inputs: { name: string; data: Uint8Array | File | Blob }[]
  command: string[]
  outputName: string
  outputMime: string
  onProgress?: ProgressHandler
  onLog?: (line: LogLine) => void
}): Promise<{ blob: Blob; logs: LogLine[] }> {
  const logs: LogLine[] = []
  const ff = await getFFmpeg({
    onLog: (line) => {
      logs.push(line)
      args.onLog?.(line)
    },
  })

  const handleProgress = ({ progress }: { progress: number }) => {
    args.onProgress?.(Math.max(0, Math.min(1, progress)))
  }
  if (args.onProgress) ff.on('progress', handleProgress)

  try {
    for (const input of args.inputs) {
      const data =
        input.data instanceof File || input.data instanceof Blob
          ? await fetchFile(input.data)
          : input.data
      await ff.writeFile(input.name, data)
    }

    const code = await ff.exec(args.command)
    if (code !== 0) {
      throw new Error(
        `ffmpeg exited with code ${code}. Last log: ${
          logs[logs.length - 1]?.message ?? '(none)'
        }`,
      )
    }

    const out = await ff.readFile(args.outputName)
    // out is Uint8Array | string. For binary files it's Uint8Array.
    if (typeof out === 'string') {
      throw new Error('Unexpected string output from ffmpeg')
    }
    // Copy into a fresh ArrayBuffer; the underlying memory may be transient.
    const blob = new Blob([new Uint8Array(out)], { type: args.outputMime })
    return { blob, logs }
  } finally {
    if (args.onProgress) ff.off('progress', handleProgress)
    // Clean up virtual FS entries (best-effort)
    for (const input of args.inputs) {
      try {
        await ff.deleteFile(input.name)
      } catch {
        /* ignore */
      }
    }
    try {
      await ff.deleteFile(args.outputName)
    } catch {
      /* ignore */
    }
  }
}

/** Format seconds as HH:MM:SS.mmm for ffmpeg `-ss` / `-to`. */
export function toFFTime(seconds: number): string {
  const sign = seconds < 0 ? '-' : ''
  const s = Math.abs(seconds)
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return `${sign}${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${ss
    .toFixed(3)
    .padStart(6, '0')}`
}

/** Format seconds as MM:SS for UI display. */
export function fmtTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00'
  const mm = Math.floor(seconds / 60)
  const ss = Math.floor(seconds % 60)
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

export function inferMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    mp3: 'audio/mpeg',
    aac: 'audio/aac',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    gif: 'image/gif',
  }
  return map[ext] ?? 'application/octet-stream'
}
