import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  hasGifMagic,
  isGifFile,
  parseGifInfo,
  qualityToGifLossy,
  planKeptFrames,
  pickOptimizeLevel,
  buildGifCommands,
  compressGif,
  GifCancelledError,
} from '@/lib/gif-compress'

/** Build a valid multi-frame GIF89a in memory for unit & WASM tests. */
function makeSyntheticGif(width = 32, height = 24, delaysCs: number[] = [5, 5, 10, 5, 5, 10]): Uint8Array<ArrayBuffer> {
  const bytes: number[] = []
  const pushStr = (s: string) => {
    for (const ch of s) bytes.push(ch.charCodeAt(0))
  }
  const pushU16 = (v: number) => {
    bytes.push(v & 0xff, (v >> 8) & 0xff)
  }

  pushStr('GIF89a')
  pushU16(width)
  pushU16(height)
  // Global Color Table: 8 colors (size bits = 2 -> 2^(2+1) = 8)
  bytes.push(0xf2, 0, 0)
  const palette = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
    [255, 0, 255],
    [0, 255, 255],
    [255, 255, 255],
    [0, 0, 0],
  ]
  for (const [r, g, b] of palette) bytes.push(r, g, b)

  // NETSCAPE2.0 infinite-loop application extension
  bytes.push(0x21, 0xff, 0x0b)
  pushStr('NETSCAPE2.0')
  bytes.push(3, 1, 0, 0, 0)

  for (let f = 0; f < delaysCs.length; f++) {
    // Graphic Control Extension
    bytes.push(0x21, 0xf9, 4, 0)
    pushU16(delaysCs[f])
    bytes.push(0, 0)

    // Image Descriptor
    bytes.push(0x2c)
    pushU16(0)
    pushU16(0)
    pushU16(width)
    pushU16(height)
    bytes.push(0) // no LCT

    // Minimal valid LZW stream (minCodeSize = 3 -> 4-bit codes; reset before code table grows)
    bytes.push(3)
    const codes: number[] = []
    const pixelCount = width * height
    for (let p = 0; p < pixelCount; p++) {
      if (p % 6 === 0) codes.push(8) // clear code
      codes.push((f + (p % 7)) & 7)
    }
    codes.push(9) // EOI

    const lzw: number[] = []
    let bitBuf = 0
    let bitCnt = 0
    for (const c of codes) {
      bitBuf |= c << bitCnt
      bitCnt += 4
      while (bitCnt >= 8) {
        lzw.push(bitBuf & 0xff)
        bitBuf >>= 8
        bitCnt -= 8
      }
    }
    if (bitCnt > 0) lzw.push(bitBuf & 0xff)

    for (let pos = 0; pos < lzw.length; pos += 255) {
      const chunk = lzw.slice(pos, pos + 255)
      bytes.push(chunk.length, ...chunk)
    }
    bytes.push(0) // block terminator
  }
  bytes.push(0x3b) // trailer
  return new Uint8Array(bytes)
}

/** Execute the real bundled gifsicle-wasm-browser Emscripten worker function in Node. */
function loadRealNodeGifsicleRunner() {
  const req = createRequire(import.meta.url)
  const bundlePath = req.resolve('gifsicle-wasm-browser')
  const src = readFileSync(bundlePath, 'utf8')
  const gifsicleObj = new Function(src.replace('export default gifsicle;', 'return gifsicle;'))() as {
    tool: { workerLocalUrl: string }
  }
  const workerCode = gifsicleObj.tool.workerLocalUrl.replace(/onmessage=function[\s\S]*$/, 'return gifsicle;')
  const runCore = new Function('require', '__dirname', workerCode)(req, dirname(bundlePath)) as (opts: {
    data: Array<{ file: ArrayBuffer; name: string }>
    command: string[]
  }) => Promise<Array<{ file: Uint8Array; name: string }>>

  return async (inputBuf: ArrayBuffer, commands: string[]): Promise<Blob> => {
    const out = await runCore({
      data: [{ file: inputBuf, name: 'input.gif' }],
      command: commands,
    })
    if (!out?.length) throw new Error('no output')
    return new Blob([new Uint8Array(out[0].file)], { type: 'image/gif' })
  }
}

describe('isGifFile / hasGifMagic', () => {
  it('matches GIF files by MIME type or extension', () => {
    expect(isGifFile({ type: 'image/gif', name: 'anim' })).toBe(true)
    expect(isGifFile({ type: '', name: 'DEMO.GIF' })).toBe(true)
    expect(isGifFile({ type: 'image/png', name: 'photo.png' })).toBe(false)
  })

  it('recognizes GIF87a and GIF89a headers only', () => {
    expect(hasGifMagic(new TextEncoder().encode('GIF89a'))).toBe(true)
    expect(hasGifMagic(new TextEncoder().encode('GIF87a'))).toBe(true)
    expect(hasGifMagic(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe(false)
    expect(hasGifMagic(new TextEncoder().encode('GIF89'))).toBe(false)
  })
})

describe('parseGifInfo', () => {
  it('extracts dimensions, frame count, and per-frame delays', () => {
    const gif = makeSyntheticGif(48, 36, [4, 8, 12])
    expect(parseGifInfo(gif)).toEqual({
      width: 48,
      height: 36,
      frameCount: 3,
      delaysCs: [4, 8, 12],
    })
  })

  it('parses a single-frame GIF without Graphic Control Extension', () => {
    // Minimal GIF87a with 1 frame and no GCE
    const bytes = new Uint8Array([
      0x47, 0x49, 0x46, 0x38, 0x37, 0x61, // GIF87a
      10, 0, 20, 0, // 10x20
      0x00, 0, 0, // no GCT
      0x2c, 0, 0, 0, 0, 10, 0, 20, 0, 0x00, // image descriptor
      2, 2, 0x44, 0x01, 0, // LZW + terminator
      0x3b, // trailer
    ])
    expect(parseGifInfo(bytes)).toEqual({
      width: 10,
      height: 20,
      frameCount: 1,
      delaysCs: [0],
    })
  })

  it('returns null for non-GIF or truncated buffers', () => {
    expect(parseGifInfo(new Uint8Array([1, 2, 3]))).toBeNull()
    expect(parseGifInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull()
    // Valid header but zero frames
    expect(
      parseGifInfo(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 10, 0, 10, 0, 0, 0, 0, 0x3b])),
    ).toBeNull()
  })
})

describe('qualityToGifLossy', () => {
  it('maps 100 -> 0 (lossless), 80 -> ~57, and 30 -> 200 monotonically', () => {
    expect(qualityToGifLossy(100)).toBe(0)
    expect(qualityToGifLossy(80)).toBe(57)
    expect(qualityToGifLossy(30)).toBe(200)
    expect(qualityToGifLossy(120)).toBe(0)
    expect(qualityToGifLossy(5)).toBe(200)
    expect(qualityToGifLossy(90)).toBeLessThan(qualityToGifLossy(70))
  })
})

describe('planKeptFrames', () => {
  it('keeps all frames unchanged when frameSkip is 1 or single-frame', () => {
    expect(planKeptFrames([5, 5, 10], 1)).toEqual([
      { index: 0, delayCs: 5 },
      { index: 1, delayCs: 5 },
      { index: 2, delayCs: 10 },
    ])
    expect(planKeptFrames([0], 2)).toEqual([{ index: 0, delayCs: 0 }])
  })

  it('merges dropped frame delays to preserve total animation duration', () => {
    const kept = planKeptFrames([5, 5, 10, 5, 5, 10], 2)
    expect(kept).toEqual([
      { index: 0, delayCs: 10 },
      { index: 2, delayCs: 15 },
      { index: 4, delayCs: 15 },
    ])
    const totalBefore = [5, 5, 10, 5, 5, 10].reduce((a, b) => a + b, 0)
    const totalAfter = kept.reduce((a, f) => a + f.delayCs, 0)
    expect(totalAfter).toBe(totalBefore)
  })

  it('handles uneven frame counts and browser 0/1-cs clamping', () => {
    // 5 frames with step 3 -> keeps #0 (d0+d1+d2) and #3 (d3+d4)
    expect(planKeptFrames([4, 4, 4, 6, 6], 3)).toEqual([
      { index: 0, delayCs: 12 },
      { index: 3, delayCs: 12 },
    ])
    // 0-cs delays in multi-frame GIF are treated as 10 cs (browser default)
    expect(planKeptFrames([0, 0, 1, 5], 2)).toEqual([
      { index: 0, delayCs: 20 },
      { index: 2, delayCs: 15 },
    ])
  })
})

describe('pickOptimizeLevel / buildGifCommands', () => {
  it('drops from -O2 to -O1 for large files or very long animations', () => {
    expect(pickOptimizeLevel(1_000_000, 40)).toBe(2)
    expect(pickOptimizeLevel(6 * 1024 * 1024, 40)).toBe(1)
    expect(pickOptimizeLevel(500_000, 150)).toBe(1)
  })

  it('builds a single-pass command when not dropping frames, omitting no-op flags', () => {
    expect(
      buildGifCommands({
        lossy: 0,
        colors: 256,
        frameSkip: 1,
        delaysCs: [5, 5],
      }),
    ).toEqual(['-O2 /input.gif -o /out/output.gif'])

    expect(
      buildGifCommands({
        lossy: 60,
        colors: 128,
        resizeWidth: 480,
        resizeHeight: 270,
        frameSkip: 1,
        delaysCs: [5, 5],
      }),
    ).toEqual(['-O2 --lossy=60 --colors 128 --resize-fit 480x270 /input.gif -o /out/output.gif'])
  })

  it('builds a 2-pass unoptimize + frame-drop command and deduplicates consecutive -d flags', () => {
    expect(
      buildGifCommands({
        lossy: 80,
        colors: 64,
        resizeWidth: 320,
        resizeHeight: 240,
        frameSkip: 2,
        delaysCs: [5, 5, 10, 5, 5, 10],
      }),
    ).toEqual([
      '-U /input.gif -o /tem/u.gif',
      '-O2 --lossy=80 --colors 64 --resize-fit 320x240 /tem/u.gif -d10 #0 -d15 #2 #4 -o /out/output.gif',
    ])
  })

  it('stays single-pass for a single-frame GIF even if frameSkip > 1', () => {
    expect(
      buildGifCommands({
        lossy: 50,
        colors: 256,
        frameSkip: 2,
        delaysCs: [0],
      }),
    ).toEqual(['-O2 --lossy=50 /input.gif -o /out/output.gif'])
  })
})

describe('compressGif (real gifsicle WASM integration)', () => {
  const realRunner = loadRealNodeGifsicleRunner()

  it('compresses, resizes, reduces colors, and drops frames while preserving duration', async () => {
    const raw = makeSyntheticGif(32, 24, [5, 5, 10, 5, 5, 10])
    const file = new Blob([raw], { type: 'image/gif' })

    const res = await compressGif(
      file,
      {
        mode: 'quality',
        quality: 70,
        targetBytes: 100_000,
        maxEdge: 16,
        colors: 64,
        frameSkip: 2,
      },
      realRunner,
    )

    expect(res.outW).toBe(16)
    expect(res.outH).toBe(12)
    expect(res.framesBefore).toBe(6)
    expect(res.framesAfter).toBe(3)
    expect(res.blob.size).toBeLessThan(raw.byteLength)

    const outInfo = parseGifInfo(new Uint8Array(await res.blob.arrayBuffer()))
    expect(outInfo).toEqual({
      width: 16,
      height: 12,
      frameCount: 3,
      delaysCs: [10, 15, 15],
    })
  })

  it('supports target-size binary search without redundant final re-encode', async () => {
    const raw = makeSyntheticGif(32, 24, [5, 5, 5, 5])
    const file = new Blob([raw], { type: 'image/gif' })
    let calls = 0
    const mockRunner = async (_buf: ArrayBuffer, commands: string[]) => {
      calls++
      // Larger lossy -> smaller mock size
      const m = commands[commands.length - 1].match(/--lossy=(\d+)/)
      const lossy = m ? Number(m[1]) : 0
      const fakeSize = Math.max(100, 2000 - lossy * 8)
      return new Blob([new Uint8Array(fakeSize)], { type: 'image/gif' })
    }

    const res = await compressGif(
      file,
      {
        mode: 'target',
        quality: 80,
        targetBytes: 1200,
        maxEdge: null,
        colors: 256,
        frameSkip: 1,
      },
      mockRunner,
    )

    expect(res.blob.size).toBeLessThanOrEqual(1200)
    expect(calls).toBeLessThanOrEqual(7)
  })

  it('aborts promptly with GifCancelledError when cancelled', async () => {
    const raw = makeSyntheticGif(16, 16, [5, 5])
    const file = new Blob([raw], { type: 'image/gif' })
    await expect(
      compressGif(
        file,
        {
          mode: 'quality',
          quality: 80,
          targetBytes: 500,
          maxEdge: null,
          colors: 256,
          frameSkip: 1,
          isCancelled: () => true,
        },
        realRunner,
      ),
    ).rejects.toThrow(GifCancelledError)
  })
})
