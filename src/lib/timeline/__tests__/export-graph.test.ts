import { describe, it, expect } from 'vitest'
import { buildTimelineExport } from '@/lib/timeline/export-graph'
import type { Project } from '@/lib/timeline/model'

const baseProject = (tracks: Project['tracks']): Project => ({
  width: 640,
  height: 360,
  fps: 30,
  tracks,
})

describe('buildTimelineExport — video', () => {
  it('builds a base canvas + overlay for one video clip', () => {
    const p = baseProject([
      { id: 'v', kind: 'video', clips: [{ id: 'c1', sourceId: 'A', timelineStart: 0, sourceIn: 0, sourceOut: 2 }] },
    ])
    const { args, filterComplex, hasVideo, hasAudio } = buildTimelineExport(
      p,
      [{ sourceId: 'A', name: 'a.mp4', hasAudio: false }],
      { output: 'out.mp4' },
    )
    expect(hasVideo).toBe(true)
    expect(hasAudio).toBe(false)
    expect(filterComplex).toContain('color=c=black:s=640x360:r=30')
    expect(filterComplex).toContain('[0:v]trim=0.000:2.000')
    expect(filterComplex).toContain('scale=640:360:force_original_aspect_ratio=decrease')
    expect(filterComplex).toContain('setsar=1')
    expect(filterComplex).toContain("overlay=enable='between(t,0.000,2.000)'")
    expect(args).toContain('-i')
    expect(args).toContain('a.mp4')
    expect(args).toContain('libx264')
    expect(args[args.length - 1]).toBe('out.mp4')
  })

  it('chains overlays so a second clip composites on top', () => {
    const p = baseProject([
      {
        id: 'v',
        kind: 'video',
        clips: [
          { id: 'c1', sourceId: 'A', timelineStart: 0, sourceIn: 0, sourceOut: 2 },
          { id: 'c2', sourceId: 'B', timelineStart: 2, sourceIn: 0, sourceOut: 2 },
        ],
      },
    ])
    const { filterComplex } = buildTimelineExport(
      p,
      [{ sourceId: 'A', name: 'a.mp4' }, { sourceId: 'B', name: 'b.mp4' }],
      { output: 'out.mp4' },
    )
    // first overlay consumes [base], second consumes [ov0]
    expect(filterComplex).toContain('[base][v0]overlay')
    expect(filterComplex).toContain('[ov0][v1]overlay')
    expect(filterComplex).toContain("between(t,2.000,4.000)")
  })
})

describe('buildTimelineExport — audio', () => {
  it('delays + mixes audio with normalize=0', () => {
    const p = baseProject([
      { id: 'a', kind: 'audio', clips: [{ id: 'c1', sourceId: 'M', timelineStart: 1, sourceIn: 0, sourceOut: 3 }] },
    ])
    const { filterComplex, hasAudio, hasVideo, args } = buildTimelineExport(
      p,
      [{ sourceId: 'M', name: 'm.mp3' }],
      { output: 'out.mp4' },
    )
    expect(hasAudio).toBe(true)
    expect(hasVideo).toBe(false)
    expect(filterComplex).toContain('[0:a]atrim=0.000:3.000')
    expect(filterComplex).toContain('adelay=1000|1000') // 1s → 1000ms per channel
    expect(filterComplex).toContain('amix=inputs=1:normalize=0')
    expect(args).toContain('aac')
    expect(args).not.toContain('libx264')
  })

  it('mixes audio from both an audio track and a video clip', () => {
    const p = baseProject([
      { id: 'v', kind: 'video', clips: [{ id: 'c1', sourceId: 'A', timelineStart: 0, sourceIn: 0, sourceOut: 4 }] },
      { id: 'a', kind: 'audio', clips: [{ id: 'c2', sourceId: 'M', timelineStart: 0, sourceIn: 0, sourceOut: 4 }] },
    ])
    const { filterComplex } = buildTimelineExport(
      p,
      [{ sourceId: 'A', name: 'a.mp4' }, { sourceId: 'M', name: 'm.mp3' }],
      { output: 'out.mp4' },
    )
    expect(filterComplex).toContain('amix=inputs=2:normalize=0')
  })

  it('omits a muted track audio', () => {
    const p = baseProject([
      { id: 'a', kind: 'audio', muted: true, clips: [{ id: 'c1', sourceId: 'M', timelineStart: 0, sourceIn: 0, sourceOut: 3 }] },
    ])
    const { hasAudio } = buildTimelineExport(p, [{ sourceId: 'M', name: 'm.mp3' }], { output: 'out.mp4' })
    expect(hasAudio).toBe(false)
  })

  it('applies per-clip volume', () => {
    const p = baseProject([
      { id: 'a', kind: 'audio', clips: [{ id: 'c1', sourceId: 'M', timelineStart: 0, sourceIn: 0, sourceOut: 3, volume: 0.5 }] },
    ])
    const { filterComplex } = buildTimelineExport(p, [{ sourceId: 'M', name: 'm.mp3' }], { output: 'out.mp4' })
    expect(filterComplex).toContain('volume=0.5')
  })
})

describe('buildTimelineExport — wasm safety', () => {
  it('always forces -threads 1 (core-mt deadlocks on multi-input filter_complex)', () => {
    const p = baseProject([
      { id: 'v', kind: 'video', clips: [{ id: 'c1', sourceId: 'A', timelineStart: 0, sourceIn: 0, sourceOut: 2 }] },
    ])
    const { args } = buildTimelineExport(p, [{ sourceId: 'A', name: 'a.mp4' }], { output: 'out.mp4' })
    const i = args.indexOf('-threads')
    expect(i).toBe(0)
    expect(args[i + 1]).toBe('1')
  })
})

describe('buildTimelineExport — bounds', () => {
  it('sets -t to the project duration', () => {
    const p = baseProject([
      { id: 'v', kind: 'video', clips: [{ id: 'c1', sourceId: 'A', timelineStart: 1, sourceIn: 0, sourceOut: 3 }] }, // ends at 4
    ])
    const { args } = buildTimelineExport(p, [{ sourceId: 'A', name: 'a.mp4' }], { output: 'out.mp4' })
    const ti = args.indexOf('-t')
    expect(ti).toBeGreaterThan(-1)
    expect(args[ti + 1]).toBe('4.000')
  })
})
