/**
 * Client-side GIF inspection & compression helpers built on gifsicle-wasm-browser.
 *
 * Pure binary parsing (`parseGifInfo`) and gifsicle CLI builders stay separate
 * from the browser Worker runner (`compressGif`) so every decision — lossy
 * level, frame-drop delay merging, color quantization/dithering, transparency
 * optimization, unoptimization, and resize flags — is unit-testable without a
 * browser.
 */

import { fitDimensions, searchQualityForSize } from '@/lib/image-compress'

export type GifDropFrames = 'none' | 'every2' | 'every3' | 'every4' | 'every5' | 'keep1of3'
export type GifColorMode = 'none' | 'dither' | 'no-dither'

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
  /** Color reduction mode (`none` keeps original palette). */
  colorMode: GifColorMode
  /** Target palette size in [2, 256] when `colorMode !== 'none'`. */
  colorCount: number
  /** Target box for `--resize-fit`; pass null/undefined when not scaling down. */
  resizeWidth?: number | null
  resizeHeight?: number | null
  dropFrames: GifDropFrames
  delaysCs: readonly number[]
  /** Use `-O2` transparency optimization (otherwise `-O1`). Ignored if `undoOptimizations` is true. */
  optimizeTransparency: boolean
  /** Expand delta frames (`-U`) and skip re-optimizing (useful for fixing glitchy GIFs). */
  undoOptimizations: boolean
}

export type GifCompressOptions = {
  mode: 'quality' | 'target'
  /** Gifsicle lossy compression level in [0, 200] (0 = lossless, 75 = balanced default). */
  lossy: number
  /** Target output size in bytes (used when `mode === 'target'`). */
  targetBytes: number
  /** Max longest edge in px (null = keep original dimensions). */
  maxEdge: number | null
  colorMode: GifColorMode
  colorCount: number
  dropFrames: GifDropFrames
  optimizeTransparency: boolean
  undoOptimizations: boolean
  /** Optional cancellation check polled between target-size search iterations. */
  isCancelled?: () => boolean
}

export type GifCompressResult = {
  blob: Blob
  outW: number
  outH: number
  framesBefore: number
  framesAfter: number
  lossy: number
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

/** Clamp lossy compression strength to gifsicle's supported [0, 200] integer range. */
export function clampGifLossy(lossy: number): number {
  if (!Number.isFinite(lossy)) return 75
  return Math.max(0, Math.min(200, Math.round(lossy)))
}

/** Clamp GIF palette size to [2, 256]. */
export function clampGifColors(colors: number): number {
  if (!Number.isFinite(colors)) return 128
  return Math.max(2, Math.min(256, Math.round(colors)))
}

// Browsers clamp 0-cs and 1-cs frame delays to 10 cs (100 ms) in animated GIFs.
const effectiveFrameDelay = (d: number) => (d <= 1 ? 10 : d)

function shouldDropFrame(index: number, mode: GifDropFrames): boolean {
  if (index === 0) return false
  switch (mode) {
    case 'none':
      return false
    case 'every2':
      return (index + 1) % 2 === 0 // drop #1, #3, #5... (-50%)
    case 'every3':
      return (index + 1) % 3 === 0 // drop #2, #5, #8... (-33%)
    case 'every4':
      return (index + 1) % 4 === 0 // drop #3, #7, #11... (-25%)
    case 'every5':
      return (index + 1) % 5 === 0 // drop #4, #9, #14... (-20%)
    case 'keep1of3':
      return index % 3 !== 0 // keep #0, #3, #6... (-67%)
  }
}

/**
 * Drop frames according to `dropFrames` and fold each dropped frame's duration
 * into the immediately preceding kept frame so total playback speed stays
 * unchanged.
 */
export function planKeptFrames(delaysCs: readonly number[], dropFrames: GifDropFrames): PlannedFrame[] {
  const n = delaysCs.length
  if (n === 0) return []
  if (dropFrames === 'none' || n === 1) {
    return delaysCs.map((delayCs, index) => ({ index, delayCs }))
  }

  const kept: PlannedFrame[] = []
  for (let i = 0; i < n; i++) {
    const d = effectiveFrameDelay(delaysCs[i])
    if (shouldDropFrame(i, dropFrames) && kept.length > 0) {
      const prev = kept[kept.length - 1]
      prev.delayCs = Math.min(65535, prev.delayCs + d)
    } else {
      kept.push({ index: i, delayCs: Math.min(65535, d) })
    }
  }
  return kept
}

/**
 * Build the gifsicle command array passed to `gifsicle-wasm-browser`.
 *
 * When frame dropping is active on a multi-frame GIF, we run a 2-pass pipeline
 * inside the same MEMFS:
 *  1. `-w -U /input.gif -o /tem/u.gif` — unoptimize delta rectangles first so
 *     deleting intermediate frames never corrupts subsequent frames.
 *  2. Select kept frames with merged `-d<cs>` delays, then apply resize,
 *     palette reduction, dithering, lossy LZW, and optimization into `/out/output.gif`.
 */
export function buildGifCommands(opts: GifCommandOptions): string[] {
  const inputName = opts.inputName ?? '/input.gif'
  const outputPath = opts.outputPath ?? '/out/output.gif'
  const planned = opts.dropFrames !== 'none' && opts.delaysCs.length > 1 ? planKeptFrames(opts.delaysCs, opts.dropFrames) : null
  const dropFrames = planned !== null && planned.length < opts.delaysCs.length

  const commands: string[] = []
  let sourcePath = inputName

  if (dropFrames) {
    const unoptPath = '/tem/u.gif'
    commands.push(`-w -U ${inputName} -o ${unoptPath}`)
    sourcePath = unoptPath
  }

  const tokens: string[] = ['-w', '--no-comments', '--no-names']
  if (opts.undoOptimizations) {
    // If pass 1 already unoptimized into /tem/u.gif, don't repeat -U on it.
    if (!dropFrames) tokens.push('-U')
  } else {
    tokens.push(opts.optimizeTransparency ? '-O2' : '-O1')
  }

  const lossy = clampGifLossy(opts.lossy)
  if (lossy > 0) tokens.push(`--lossy=${lossy}`)

  if (opts.colorMode !== 'none') {
    const colors = clampGifColors(opts.colorCount)
    tokens.push('--colors', String(colors))
    tokens.push(opts.colorMode === 'dither' ? '--dither' : '--no-dither')
  }

  if (opts.resizeWidth && opts.resizeHeight) {
    tokens.push('--resize-fit', `${opts.resizeWidth}x${opts.resizeHeight}`)
  }

  tokens.push(sourcePath)

  if (dropFrames && planned) {
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
 * Supports direct lossy level (0..200) and target-size binary search, optional
 * resizing, color reduction with/without dithering, transparency optimization,
 * undo-optimizations, and speed-preserving frame dropping.
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
  const framesAfter =
    opts.dropFrames !== 'none' && info.frameCount > 1
      ? planKeptFrames(info.delaysCs, opts.dropFrames).length
      : info.frameCount

  const encodeAtLossy = async (lossy: number): Promise<Blob> => {
    if (opts.isCancelled?.()) throw new GifCancelledError()
    const commands = buildGifCommands({
      lossy,
      colorMode: opts.colorMode,
      colorCount: opts.colorCount,
      resizeWidth: needsResize ? outW : null,
      resizeHeight: needsResize ? outH : null,
      dropFrames: opts.dropFrames,
      delaysCs: info.delaysCs,
      optimizeTransparency: opts.optimizeTransparency,
      undoOptimizations: opts.undoOptimizations,
    })
    return runner(rawBuf, commands)
  }

  if (opts.mode === 'target') {
    // Fast path: if lossless (lossy = 0) already fits under target, avoid searching.
    const lossless = await encodeAtLossy(0)
    if (opts.isCancelled?.()) throw new GifCancelledError()
    if (lossless.size <= opts.targetBytes) {
      return {
        blob: lossless,
        outW,
        outH,
        framesBefore: info.frameCount,
        framesAfter,
        lossy: 0,
      }
    }

    // Binary-search inverted quality q = 200 - lossy in [0..199] (higher q =
    // lower lossy = larger file) to find the least aggressive lossy that fits.
    const cache = new Map<number, Blob>()
    const bestQ = await searchQualityForSize(
      async (q) => {
        const lossy = 200 - q
        const blob = await encodeAtLossy(lossy)
        cache.set(lossy, blob)
        return blob.size
      },
      opts.targetBytes,
      0,
      199,
      8,
    )
    if (opts.isCancelled?.()) throw new GifCancelledError()
    const bestLossy = 200 - bestQ
    const blob = cache.get(bestLossy) ?? (await encodeAtLossy(bestLossy))
    return {
      blob,
      outW,
      outH,
      framesBefore: info.frameCount,
      framesAfter,
      lossy: bestLossy,
    }
  }

  const usedLossy = clampGifLossy(opts.lossy)
  const blob = await encodeAtLossy(usedLossy)
  return {
    blob,
    outW,
    outH,
    framesBefore: info.frameCount,
    framesAfter,
    lossy: usedLossy,
  }
}
