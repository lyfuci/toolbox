/**
 * Client-side GIF inspection & compression helpers built on gifsicle-wasm-browser.
 *
 * Pure binary parsing (`parseGifInfo`) and gifsicle CLI builders stay separate
 * from the browser Worker runner (`compressGif`) so every decision — lossy
 * mapping, frame-skip delay merging, optimization level, and resize flags — is
 * unit-testable without a browser.
 */

import { fitDimensions, searchQualityForSize } from '@/lib/image-compress'

export type GifColors = 256 | 128 | 64 | 32
export type GifFrameSkip = 1 | 2 | 3

export type GifInfo = {
  width: number
  height: number
  frameCount: number
  /** Per-frame delay in 1/100 s (centiseconds), length === frameCount. */
  delaysCs: number[]
}

export type PlannedFrame = {
  /** 0-based frame index in the unoptimized source GIF. */
  index: number
  /** Merged delay in centiseconds (1/100 s) so total playback speed stays intact. */
  delayCs: number
}

export type GifCommandOptions = {
  inputName?: string
  outputPath?: string
  /** Gifsicle `--lossy` strength: 0 = lossless (omitted), 1..200 = lossy. */
  lossy: number
  colors: GifColors
  /** Target box for `--resize-fit`; pass null/undefined when not scaling down. */
  resizeWidth?: number | null
  resizeHeight?: number | null
  frameSkip: GifFrameSkip
  delaysCs: readonly number[]
  optimizeLevel?: 1 | 2 | 3
}

export type GifCompressOptions = {
  mode: 'quality' | 'target'
  /** UI quality slider value in [30, 100]. */
  quality: number
  /** Target output size in bytes (used when `mode === 'target'`). */
  targetBytes: number
  /** Max longest edge in px (null = keep original dimensions). */
  maxEdge: number | null
  colors: GifColors
  frameSkip: GifFrameSkip
  /** Optional cancellation check polled between target-size search iterations. */
  isCancelled?: () => boolean
}

export type GifCompressResult = {
  blob: Blob
  outW: number
  outH: number
  framesBefore: number
  framesAfter: number
  quality: number
}

export class GifCancelledError extends Error {
  constructor() {
    super('GIF compression cancelled')
    this.name = 'GifCancelledError'
  }
}

/** True when a File looks like a GIF by MIME type or `.gif` extension. */
export function isGifFile(file: Pick<File, 'type' | 'name'>): boolean {
  return file.type === 'image/gif' || /\.gif$/i.test(file.name)
}

/** True when the first 6 bytes match the GIF87a or GIF89a magic signature. */
export function hasGifMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  )
}

/**
 * Parse GIF87a / GIF89a header, logical screen dimensions, frame count, and
 * per-frame delays directly from raw bytes. Returns `null` if the buffer is
 * not a valid GIF.
 */
export function parseGifInfo(bytes: Uint8Array): GifInfo | null {
  if (bytes.length < 14 || !hasGifMagic(bytes)) return null

  const width = bytes[6] | (bytes[7] << 8)
  const height = bytes[8] | (bytes[9] << 8)
  if (width === 0 || height === 0) return null

  const packedGct = bytes[10]
  let i = 13
  if (packedGct & 0x80) {
    const gctEntries = 1 << ((packedGct & 0x07) + 1)
    i += 3 * gctEntries
  }
  if (i > bytes.length) return null

  const delaysCs: number[] = []
  let pendingDelay = 0

  const skipSubBlocks = (pos: number): number => {
    let p = pos
    while (p < bytes.length) {
      const size = bytes[p++]
      if (size === 0) return p
      p += size
    }
    return bytes.length
  }

  while (i < bytes.length) {
    const introducer = bytes[i++]
    if (introducer === 0x3b) {
      // Trailer
      break
    } else if (introducer === 0x21) {
      // Extension block
      if (i >= bytes.length) break
      const label = bytes[i++]
      if (label === 0xf9 && i + 5 <= bytes.length && bytes[i] === 4) {
        // Graphic Control Extension: [blockSize=4, packed, delayLo, delayHi, transparentIdx, 0]
        pendingDelay = bytes[i + 2] | (bytes[i + 3] << 8)
      }
      i = skipSubBlocks(i)
    } else if (introducer === 0x2c) {
      // Image Descriptor (9 bytes after introducer)
      if (i + 9 > bytes.length) break
      const packedLct = bytes[i + 8]
      i += 9
      if (packedLct & 0x80) {
        const lctEntries = 1 << ((packedLct & 0x07) + 1)
        i += 3 * lctEntries
      }
      if (i >= bytes.length) break
      i += 1 // LZW minimum code size
      i = skipSubBlocks(i)
      delaysCs.push(pendingDelay)
      pendingDelay = 0
    } else {
      // Unknown/padding byte — stop parsing rather than looping forever.
      break
    }
  }

  if (delaysCs.length === 0) return null
  return { width, height, frameCount: delaysCs.length, delaysCs }
}

/**
 * Map the page's quality slider (30..100) monotonically to gifsicle's
 * `--lossy` value (200..0).
 *  - 100 → 0 (lossless optimization only)
 *  - 80  → 57 (balanced default, right inside gifsicle's 30–60 sweet spot)
 *  - 30  → 200 (strongest lossy compression)
 */
export function qualityToGifLossy(quality: number): number {
  const clamped = Math.max(30, Math.min(100, quality))
  if (clamped >= 100) return 0
  return Math.round(((100 - clamped) / 70) * 200)
}

// Browsers clamp 0-cs and 1-cs frame delays to 10 cs (100 ms) in animated GIFs.
const effectiveFrameDelay = (d: number) => (d <= 1 ? 10 : d)

/**
 * Pick every `frameSkip`-th frame and fold dropped frames' delays into the
 * kept frame preceding them so overall animation speed stays unchanged.
 */
export function planKeptFrames(delaysCs: readonly number[], frameSkip: GifFrameSkip): PlannedFrame[] {
  const n = delaysCs.length
  if (n === 0) return []
  if (frameSkip <= 1 || n === 1) {
    return delaysCs.map((delayCs, index) => ({ index, delayCs }))
  }
  const kept: PlannedFrame[] = []
  for (let i = 0; i < n; i += frameSkip) {
    let sum = 0
    const end = Math.min(i + frameSkip, n)
    for (let j = i; j < end; j++) {
      sum += effectiveFrameDelay(delaysCs[j])
    }
    kept.push({ index: i, delayCs: Math.min(65535, sum) })
  }
  return kept
}

/**
 * Choose `-O2` for normal GIFs and `-O1` for very large / long animations so
 * WASM runtime stays responsive (gifsicle `-O2`/`-O3` scales superlinearly on
 * multi-megabyte animations with minimal extra savings over `-O1`).
 */
export function pickOptimizeLevel(byteLength: number, frameCount: number): 1 | 2 {
  if (byteLength > 5 * 1024 * 1024 || frameCount > 120) return 1
  return 2
}

/**
 * Build the gifsicle command array passed to `gifsicle-wasm-browser`.
 *
 * When frame dropping is active on a multi-frame GIF, we run a 2-pass pipeline
 * inside the same MEMFS:
 *  1. `-U /input.gif -o /tem/u.gif` — unoptimize delta rectangles first so
 *     deleting intermediate frames never corrupts subsequent frames.
 *  2. Select kept frames with merged `-d<cs>` delays, then resize/quantize/
 *     lossy-optimize into `/out/output.gif`.
 */
export function buildGifCommands(opts: GifCommandOptions): string[] {
  const inputName = opts.inputName ?? '/input.gif'
  const outputPath = opts.outputPath ?? '/out/output.gif'
  const optLevel = opts.optimizeLevel ?? 2
  const dropFrames = opts.frameSkip > 1 && opts.delaysCs.length > 1

  const commands: string[] = []
  let sourcePath = inputName

  if (dropFrames) {
    const unoptPath = '/tem/u.gif'
    commands.push(`-U ${inputName} -o ${unoptPath}`)
    sourcePath = unoptPath
  }

  const tokens: string[] = [`-O${optLevel}`]
  if (opts.lossy > 0) tokens.push(`--lossy=${Math.min(200, Math.round(opts.lossy))}`)
  if (opts.colors < 256) tokens.push('--colors', String(opts.colors))
  if (opts.resizeWidth && opts.resizeHeight) {
    tokens.push('--resize-fit', `${opts.resizeWidth}x${opts.resizeHeight}`)
  }

  tokens.push(sourcePath)

  if (dropFrames) {
    const planned = planKeptFrames(opts.delaysCs, opts.frameSkip)
    let lastDelay = -1
    for (const frame of planned) {
      if (frame.delayCs !== lastDelay) {
        tokens.push(`-d${frame.delayCs}`)
        lastDelay = frame.delayCs
      }
      tokens.push(`#${frame.index}`)
    }
  }

  tokens.push('-o', outputPath)
  commands.push(tokens.join(' '))
  return commands
}

type GifsicleRunner = (inputBuf: ArrayBuffer, commands: string[]) => Promise<Blob>

async function runGifsicleBrowser(inputBuf: ArrayBuffer, commands: string[]): Promise<Blob> {
  const mod = await import('gifsicle-wasm-browser')
  const gifsicle = mod.default
  // Always pass a fresh input object — gifsicle-wasm-browser mutates `input[i].file`
  // in place inside `loadFile`, and resolves `null` on worker error.
  const out = await gifsicle.run({
    input: [{ file: inputBuf, name: 'input.gif' }],
    command: commands,
  })
  if (!out || out.length === 0) {
    throw new Error('gifsicle failed to produce an output GIF')
  }
  return out[0]
}

/**
 * Compress a GIF in a background Web Worker via gifsicle-wasm-browser.
 * Supports both quality mode and target-size binary search, optional resizing,
 * color reduction, and speed-preserving frame dropping.
 */
export async function compressGif(
  file: Blob,
  opts: GifCompressOptions,
  runner: GifsicleRunner = runGifsicleBrowser,
): Promise<GifCompressResult> {
  const rawBuf = await file.arrayBuffer()
  const bytes = new Uint8Array(rawBuf)
  const info = parseGifInfo(bytes)
  if (!info) throw new Error('Invalid GIF file')

  const { width: outW, height: outH } = fitDimensions(info.width, info.height, opts.maxEdge)
  const needsResize = outW < info.width || outH < info.height
  const optimizeLevel = pickOptimizeLevel(bytes.byteLength, info.frameCount)
  const framesAfter =
    opts.frameSkip > 1 && info.frameCount > 1
      ? planKeptFrames(info.delaysCs, opts.frameSkip).length
      : info.frameCount

  const encodeAt = async (q: number): Promise<Blob> => {
    if (opts.isCancelled?.()) throw new GifCancelledError()
    const commands = buildGifCommands({
      lossy: qualityToGifLossy(q),
      colors: opts.colors,
      resizeWidth: needsResize ? outW : null,
      resizeHeight: needsResize ? outH : null,
      frameSkip: opts.frameSkip,
      delaysCs: info.delaysCs,
      optimizeLevel,
    })
    return runner(rawBuf, commands)
  }

  if (opts.mode === 'target') {
    const cache = new Map<number, Blob>()
    const bestQ = await searchQualityForSize(
      async (q) => {
        const blob = await encodeAt(q)
        cache.set(q, blob)
        return blob.size
      },
      opts.targetBytes,
      30,
      100,
      7,
    )
    if (opts.isCancelled?.()) throw new GifCancelledError()
    const blob = cache.get(bestQ) ?? (await encodeAt(bestQ))
    return {
      blob,
      outW,
      outH,
      framesBefore: info.frameCount,
      framesAfter,
      quality: bestQ,
    }
  }

  const blob = await encodeAt(opts.quality)
  return {
    blob,
    outW,
    outH,
    framesBefore: info.frameCount,
    framesAfter,
    quality: opts.quality,
  }
}
