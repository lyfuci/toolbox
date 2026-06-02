import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { buildTimelineExport } from '@/lib/timeline/export-graph'
import type { Project } from '@/lib/timeline/model'

/**
 * Validates the generated filtergraph against REAL system ffmpeg (not wasm).
 * This proves the export command actually composites — milliseconds, headless.
 * Skips automatically if the fixtures / ffmpeg aren't present (e.g. CI), so it
 * never breaks the normal `pnpm test` run on machines without them.
 */
const DIR = '/tmp/tbverify'
const FFMPEG = '/usr/bin/ffmpeg'
const FFPROBE = '/usr/bin/ffprobe'
const haveFixtures =
  existsSync(FFMPEG) &&
  existsSync(`${DIR}/A.mp4`) &&
  existsSync(`${DIR}/B.mp4`) &&
  existsSync(`${DIR}/M.mp3`)

const probe = (file: string, stream: 'v' | 'a', field: string): string =>
  execFileSync(FFPROBE, [
    '-v', 'error',
    '-select_streams', `${stream}:0`,
    '-show_entries', `stream=${field}`,
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ])
    .toString()
    .trim()

const probeDuration = (file: string): number =>
  parseFloat(
    execFileSync(FFPROBE, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      file,
    ]).toString().trim(),
  )

describe.skipIf(!haveFixtures)('export-graph against real ffmpeg', () => {
  it('composites two differently-sized video clips + an audio bed into one mp4', () => {
    const project: Project = {
      width: 640,
      height: 360,
      fps: 30,
      tracks: [
        {
          id: 'v',
          kind: 'video',
          clips: [
            // A (320x240) 0..2, then B (640x480) trimmed 0..2 at t=2 → total 4s
            { id: 'c1', sourceId: 'A', timelineStart: 0, sourceIn: 0, sourceOut: 2 },
            { id: 'c2', sourceId: 'B', timelineStart: 2, sourceIn: 0, sourceOut: 2 },
          ],
        },
        {
          id: 'a',
          kind: 'audio',
          clips: [{ id: 'c3', sourceId: 'M', timelineStart: 0, sourceIn: 0, sourceOut: 4, volume: 0.8 }],
        },
      ],
    }
    const out = `${DIR}/timeline_out.mp4`
    const { args } = buildTimelineExport(
      project,
      [
        { sourceId: 'A', name: 'A.mp4', hasAudio: true, hasVideo: true },
        { sourceId: 'B', name: 'B.mp4', hasAudio: true, hasVideo: true },
        { sourceId: 'M', name: 'M.mp3', hasAudio: true, hasVideo: false },
      ],
      { output: out, crf: 28, preset: 'ultrafast' },
    )
    // Run real ffmpeg in the fixtures dir.
    execFileSync(FFMPEG, ['-y', ...args], { cwd: DIR, stdio: 'pipe' })

    // Output exists, ~4s, 640x360, has both streams.
    const dur = probeDuration(out)
    expect(dur).toBeGreaterThan(3.5)
    expect(dur).toBeLessThan(4.6)
    expect(probe(out, 'v', 'width')).toBe('640')
    expect(probe(out, 'v', 'height')).toBe('360')
    expect(probe(out, 'a', 'codec_type')).toBe('audio')
  }, 60000)

  it('handles an audio-only project (no video map)', () => {
    const project: Project = {
      width: 640,
      height: 360,
      fps: 30,
      tracks: [{ id: 'a', kind: 'audio', clips: [{ id: 'c1', sourceId: 'M', timelineStart: 1, sourceIn: 0, sourceOut: 2 }] }],
    }
    const out = `${DIR}/timeline_audio_out.m4a`
    const { args } = buildTimelineExport(project, [{ sourceId: 'M', name: 'M.mp3', hasAudio: true, hasVideo: false }], {
      output: out,
    })
    execFileSync(FFMPEG, ['-y', ...args], { cwd: DIR, stdio: 'pipe' })
    expect(probe(out, 'a', 'codec_type')).toBe('audio')
    // 1s delay + 2s clip → ~3s
    expect(probeDuration(out)).toBeGreaterThan(2.5)
  }, 60000)
})
