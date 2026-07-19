/**
 * ffmpeg argument builders — pure functions that turn UI options into the
 * `string[]` command passed to ffmpeg.wasm. Keeping these separate from the
 * React page makes the (otherwise un-unit-testable) media pipeline testable:
 * we assert on the generated argument arrays.
 *
 * Conventions:
 *  - Inputs are always named `input.<ext>` / `in0.<ext>` etc. by the caller;
 *    these builders take the concrete input/output names so they stay pure.
 *  - Time values use ffmpeg's HH:MM:SS.mmm via toFFTime (re-exported from
 *    ./ffmpeg) — but builders accept raw seconds and format internally so
 *    tests don't depend on string plumbing.
 */
import { toFFTime } from '@/lib/ffmpeg'

// ── Trim ──────────────────────────────────────────────────────────────────
// Cut `[startSec, endSec)` out of the input. Stream-copies by default (fast,
// lossless, container-preserving); pass `reencode` for frame-accurate video.
//
// We seek with `-ss` *before* `-i` (fast input seek) and bound the output with
// `-t DURATION` (= end − start) *after* `-i`. `-t` is an unambiguous output-side
// duration across ffmpeg builds; the alternative `-ss … -to …` both placed
// before `-i` is version-dependent (some builds read `-to` as absolute, others
// as relative to the seek point), so we avoid it.
export function buildTrimArgs(opts: {
  input: string
  output: string
  startSec: number
  endSec: number
  reencode?: boolean
}): string[] {
  const { input, output, startSec, endSec, reencode } = opts
  const duration = Math.max(0, endSec - startSec)
  const args = ['-ss', toFFTime(startSec), '-i', input, '-t', toFFTime(duration)]
  if (reencode) {
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac')
  } else {
    args.push('-c', 'copy')
  }
  args.push(output)
  return args
}

// ── Compress ────────────────────────────────────────────────────────────────
// CRF-based H.264 compression. Lower CRF = higher quality/larger; 18–28 typical.
export function buildCompressArgs(opts: {
  input: string
  output: string
  crf: number
  preset: string
  audioBitrateK?: number
}): string[] {
  const { input, output, crf, preset, audioBitrateK = 128 } = opts
  return [
    '-i', input,
    '-c:v', 'libx264',
    '-preset', preset,
    '-crf', String(crf),
    '-c:a', 'aac',
    '-b:a', `${audioBitrateK}k`,
    '-movflags', '+faststart',
    output,
  ]
}

// ── Resize / scale ──────────────────────────────────────────────────────────
// Scale to a target width keeping aspect (height = -2 → even number for x264).
export function buildResizeArgs(opts: {
  input: string
  output: string
  width: number
  fps?: number | null
}): string[] {
  const { input, output, width, fps } = opts
  const filters = [`scale=${width}:-2:flags=lanczos`]
  if (fps && fps > 0) filters.push(`fps=${fps}`)
  return [
    '-i', input,
    '-vf', filters.join(','),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-c:a', 'copy',
    output,
  ]
}

// ── Mute (strip audio) ──────────────────────────────────────────────────────
export function buildMuteArgs(opts: { input: string; output: string }): string[] {
  return ['-i', opts.input, '-c:v', 'copy', '-an', opts.output]
}

// ── Rotate / flip ───────────────────────────────────────────────────────────
export type Transform = 'rotate90' | 'rotate180' | 'rotate270' | 'flipH' | 'flipV'

export function transformFilter(tf: Transform): string {
  switch (tf) {
    case 'rotate90':
      return 'transpose=1' // 90° clockwise
    case 'rotate270':
      return 'transpose=2' // 90° counter-clockwise
    case 'rotate180':
      return 'transpose=1,transpose=1'
    case 'flipH':
      return 'hflip'
    case 'flipV':
      return 'vflip'
  }
}

export function buildTransformArgs(opts: {
  input: string
  output: string
  transform: Transform
}): string[] {
  return [
    '-i', opts.input,
    '-vf', transformFilter(opts.transform),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-c:a', 'copy',
    opts.output,
  ]
}

// ── Thumbnail / frame grab ──────────────────────────────────────────────────
// Single frame at `atSec` as a PNG (or JPEG via output ext).
export function buildThumbnailArgs(opts: {
  input: string
  output: string
  atSec: number
  width?: number | null
}): string[] {
  const { input, output, atSec, width } = opts
  const args = ['-ss', toFFTime(atSec), '-i', input, '-frames:v', '1']
  if (width && width > 0) args.push('-vf', `scale=${width}:-1`)
  args.push('-q:v', '2', output)
  return args
}

// ── Extract audio ───────────────────────────────────────────────────────────
export function buildExtractAudioArgs(opts: {
  input: string
  output: string
  codec: 'libmp3lame' | 'aac' | 'flac' | 'pcm_s16le'
  bitrateK?: number
}): string[] {
  const { input, output, codec, bitrateK = 192 } = opts
  const args = ['-i', input, '-vn', '-c:a', codec]
  // Lossless codecs ignore bitrate.
  if (codec === 'libmp3lame' || codec === 'aac') args.push('-b:a', `${bitrateK}k`)
  args.push(output)
  return args
}

// ── Audio loudness normalization (EBU R128) ─────────────────────────────────
export function buildLoudnormArgs(opts: { input: string; output: string }): string[] {
  return [
    '-i', opts.input,
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
    '-c:a', 'aac', '-b:a', '192k',
    opts.output,
  ]
}

// ── Convert container/codec ─────────────────────────────────────────────────
export function buildConvertArgs(opts: {
  input: string
  output: string
  target: 'mp4' | 'webm' | 'mov' | 'mkv'
}): string[] {
  const { input, output, target } = opts
  if (target === 'webm') {
    return ['-i', input, '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-c:a', 'libopus', output]
  }
  // mp4 / mov / mkv → H.264 + AAC, widely compatible.
  return [
    '-i', input,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    ...(target === 'mp4' ? ['-movflags', '+faststart'] : []),
    output,
  ]
}

// ── GIF (two-pass with palette for quality) ─────────────────────────────────
// First pass writes a palette PNG; second pass uses it. The caller runs both.
export function buildGifPalettePassArgs(opts: {
  input: string
  palette: string
  fps: number
  width: number
}): string[] {
  return [
    '-i', opts.input,
    '-vf', `fps=${opts.fps},scale=${opts.width}:-1:flags=lanczos,palettegen`,
    opts.palette,
  ]
}

export function buildGifRenderArgs(opts: {
  input: string
  palette: string
  output: string
  fps: number
  width: number
}): string[] {
  return [
    '-i', opts.input,
    '-i', opts.palette,
    '-lavfi', `fps=${opts.fps},scale=${opts.width}:-1:flags=lanczos[x];[x][1:v]paletteuse`,
    opts.output,
  ]
}

// ── Concat (re-encode to a common format so mixed codecs work) ───────────────
// Builds the args for the concat-filter approach: N inputs → one re-encoded out.
export function buildConcatReencodeArgs(opts: {
  inputs: string[]
  output: string
  hasAudio: boolean
}): string[] {
  const { inputs, output, hasAudio } = opts
  const args: string[] = []
  for (const name of inputs) args.push('-i', name)
  const n = inputs.length
  // Build the concat filter: [0:v][0:a][1:v][1:a]...concat=n=N:v=1:a=1
  let filter = ''
  for (let i = 0; i < n; i++) {
    filter += hasAudio ? `[${i}:v][${i}:a]` : `[${i}:v]`
  }
  filter += `concat=n=${n}:v=1:a=${hasAudio ? 1 : 0}`
  filter += hasAudio ? '[v][a]' : '[v]'
  args.push('-filter_complex', filter, '-map', '[v]')
  if (hasAudio) args.push('-map', '[a]')
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23')
  if (hasAudio) args.push('-c:a', 'aac', '-b:a', '128k')
  args.push(output)
  return args
}

// ── Concat (stream copy via demuxer — fast, needs identical codecs) ──────────
export function buildConcatCopyArgs(opts: { listFile: string; output: string }): string[] {
  return ['-f', 'concat', '-safe', '0', '-i', opts.listFile, '-c', 'copy', opts.output]
}
