import { describe, it, expect } from 'vitest'
import {
  buildTrimArgs,
  buildCompressArgs,
  buildResizeArgs,
  buildMuteArgs,
  buildTransformArgs,
  transformFilter,
  buildThumbnailArgs,
  buildExtractAudioArgs,
  buildLoudnormArgs,
  buildConvertArgs,
  buildGifPalettePassArgs,
  buildGifRenderArgs,
  buildConcatReencodeArgs,
  buildConcatCopyArgs,
} from '@/lib/media-ops'

describe('buildTrimArgs', () => {
  it('stream-copies by default with start/end', () => {
    const a = buildTrimArgs({ input: 'in.mp4', output: 'out.mp4', startSec: 1.5, endSec: 4 })
    // -ss before -i (fast seek), -t DURATION after -i (unambiguous end−start).
    expect(a).toEqual(['-ss', '00:00:01.500', '-i', 'in.mp4', '-t', '00:00:02.500', '-c', 'copy', 'out.mp4'])
  })
  it('re-encodes when asked', () => {
    const a = buildTrimArgs({ input: 'in.mp4', output: 'out.mp4', startSec: 0, endSec: 2, reencode: true })
    expect(a).toContain('libx264')
    expect(a).not.toContain('copy')
  })
})

describe('buildCompressArgs', () => {
  it('uses CRF + preset + faststart', () => {
    const a = buildCompressArgs({ input: 'i.mp4', output: 'o.mp4', crf: 28, preset: 'fast' })
    expect(a).toEqual([
      '-i', 'i.mp4', '-c:v', 'libx264', '-preset', 'fast', '-crf', '28',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', 'o.mp4',
    ])
  })
  it('honours a custom audio bitrate', () => {
    expect(buildCompressArgs({ input: 'i.mp4', output: 'o.mp4', crf: 23, preset: 'medium', audioBitrateK: 256 }))
      .toContain('256k')
  })
})

describe('buildResizeArgs', () => {
  it('scales to width with even height and lanczos', () => {
    const a = buildResizeArgs({ input: 'i.mp4', output: 'o.mp4', width: 1280 })
    expect(a.join(' ')).toContain('scale=1280:-2:flags=lanczos')
  })
  it('appends fps when provided', () => {
    const a = buildResizeArgs({ input: 'i.mp4', output: 'o.mp4', width: 640, fps: 30 })
    expect(a.join(' ')).toContain('fps=30')
  })
  it('omits fps when null', () => {
    const a = buildResizeArgs({ input: 'i.mp4', output: 'o.mp4', width: 640, fps: null })
    expect(a.join(' ')).not.toContain('fps=')
  })
})

describe('buildMuteArgs', () => {
  it('copies video and drops audio', () => {
    expect(buildMuteArgs({ input: 'i.mp4', output: 'o.mp4' })).toEqual([
      '-i', 'i.mp4', '-c:v', 'copy', '-an', 'o.mp4',
    ])
  })
})

describe('transforms', () => {
  it('maps each transform to the right filter', () => {
    expect(transformFilter('rotate90')).toBe('transpose=1')
    expect(transformFilter('rotate270')).toBe('transpose=2')
    expect(transformFilter('rotate180')).toBe('transpose=1,transpose=1')
    expect(transformFilter('flipH')).toBe('hflip')
    expect(transformFilter('flipV')).toBe('vflip')
  })
  it('builds a transform command', () => {
    const a = buildTransformArgs({ input: 'i.mp4', output: 'o.mp4', transform: 'flipH' })
    expect(a.join(' ')).toContain('-vf hflip')
    expect(a).toContain('libx264')
  })
})

describe('buildThumbnailArgs', () => {
  it('grabs one frame at a time', () => {
    const a = buildThumbnailArgs({ input: 'i.mp4', output: 't.png', atSec: 3 })
    expect(a).toEqual(['-ss', '00:00:03.000', '-i', 'i.mp4', '-frames:v', '1', '-q:v', '2', 't.png'])
  })
  it('adds a scale filter when width given', () => {
    const a = buildThumbnailArgs({ input: 'i.mp4', output: 't.png', atSec: 0, width: 320 })
    expect(a.join(' ')).toContain('scale=320:-1')
  })
})

describe('buildExtractAudioArgs', () => {
  it('mp3 with bitrate', () => {
    const a = buildExtractAudioArgs({ input: 'i.mp4', output: 'a.mp3', codec: 'libmp3lame' })
    expect(a).toEqual(['-i', 'i.mp4', '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', 'a.mp3'])
  })
  it('flac is lossless (no bitrate flag)', () => {
    const a = buildExtractAudioArgs({ input: 'i.mp4', output: 'a.flac', codec: 'flac' })
    expect(a).not.toContain('-b:a')
  })
})

describe('buildLoudnormArgs', () => {
  it('applies EBU R128 loudnorm', () => {
    expect(buildLoudnormArgs({ input: 'i.mp4', output: 'o.m4a' }).join(' ')).toContain('loudnorm=I=-16:TP=-1.5:LRA=11')
  })
})

describe('buildConvertArgs', () => {
  it('mp4 uses x264 + faststart', () => {
    const a = buildConvertArgs({ input: 'i.mov', output: 'o.mp4', target: 'mp4' })
    expect(a).toContain('libx264')
    expect(a.join(' ')).toContain('+faststart')
  })
  it('webm uses vp9 + opus', () => {
    const a = buildConvertArgs({ input: 'i.mp4', output: 'o.webm', target: 'webm' })
    expect(a).toContain('libvpx-vp9')
    expect(a).toContain('libopus')
  })
  it('mkv omits faststart', () => {
    expect(buildConvertArgs({ input: 'i.mp4', output: 'o.mkv', target: 'mkv' }).join(' ')).not.toContain('faststart')
  })
})

describe('GIF two-pass', () => {
  it('palette pass generates a palette', () => {
    const a = buildGifPalettePassArgs({ input: 'i.mp4', palette: 'p.png', fps: 12, width: 480 })
    expect(a.join(' ')).toContain('palettegen')
    expect(a.join(' ')).toContain('fps=12')
    expect(a[a.length - 1]).toBe('p.png')
  })
  it('render pass uses the palette', () => {
    const a = buildGifRenderArgs({ input: 'i.mp4', palette: 'p.png', output: 'o.gif', fps: 12, width: 480 })
    expect(a.join(' ')).toContain('paletteuse')
    expect(a).toContain('p.png')
    expect(a[a.length - 1]).toBe('o.gif')
  })
})

describe('concat', () => {
  it('re-encode concat with audio builds the right filter_complex', () => {
    const a = buildConcatReencodeArgs({ inputs: ['a.mp4', 'b.mp4'], output: 'o.mp4', hasAudio: true })
    const s = a.join(' ')
    expect(s).toContain('[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]')
    expect(s).toContain('-map [v]')
    expect(s).toContain('-map [a]')
    expect(a).toContain('libx264')
  })
  it('re-encode concat without audio omits audio mapping', () => {
    const a = buildConcatReencodeArgs({ inputs: ['a.mp4', 'b.mp4', 'c.mp4'], output: 'o.mp4', hasAudio: false })
    const s = a.join(' ')
    expect(s).toContain('concat=n=3:v=1:a=0[v]')
    expect(s).not.toContain('[a]')
    expect(a).not.toContain('-c:a')
  })
  it('copy concat uses the demuxer', () => {
    expect(buildConcatCopyArgs({ listFile: 'list.txt', output: 'o.mp4' })).toEqual([
      '-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'o.mp4',
    ])
  })
})
