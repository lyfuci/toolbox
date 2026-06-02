import { describe, it, expect } from 'vitest'
import {
  type Project,
  type Track,
  clipDuration,
  clipEnd,
  projectDuration,
  clipsOverlap,
  clipAt,
  timelineToSource,
  resolveDropStart,
  appendClip,
  emptyProject,
} from '@/lib/timeline/model'

const clip = (id: string, start: number, inS: number, outS: number) => ({
  id,
  sourceId: 's',
  timelineStart: start,
  sourceIn: inS,
  sourceOut: outS,
})

describe('clip math', () => {
  it('duration and end', () => {
    const c = clip('a', 5, 2, 6) // dur 4 → end 9
    expect(clipDuration(c)).toBe(4)
    expect(clipEnd(c)).toBe(9)
  })
  it('timelineToSource maps within a clip', () => {
    const c = clip('a', 10, 3, 8)
    expect(timelineToSource(c, 12)).toBe(5) // 3 + (12-10)
  })
})

describe('overlap + clipAt', () => {
  const track: Track = { id: 't', kind: 'video', clips: [clip('a', 0, 0, 4), clip('b', 4, 0, 4)] }
  it('adjacent clips do not overlap', () => {
    expect(clipsOverlap(track.clips[0], track.clips[1])).toBe(false)
  })
  it('overlapping clips detected', () => {
    expect(clipsOverlap(clip('a', 0, 0, 5), clip('b', 3, 0, 5))).toBe(true)
  })
  it('clipAt returns the active clip and null in gaps', () => {
    expect(clipAt(track, 2)?.id).toBe('a')
    expect(clipAt(track, 5)?.id).toBe('b')
    expect(clipAt({ id: 't', kind: 'video', clips: [clip('a', 0, 0, 2)] }, 5)).toBeNull()
  })
})

describe('projectDuration', () => {
  it('is the max clip end across tracks', () => {
    const p: Project = {
      width: 1280, height: 720, fps: 30,
      tracks: [
        { id: 'v', kind: 'video', clips: [clip('a', 0, 0, 3)] },
        { id: 'a', kind: 'audio', clips: [clip('b', 2, 0, 5)] }, // ends at 7
      ],
    }
    expect(projectDuration(p)).toBe(7)
  })
})

describe('resolveDropStart', () => {
  const track: Track = { id: 't', kind: 'video', clips: [clip('a', 0, 0, 4), clip('b', 4, 0, 4)] }
  it('keeps a non-overlapping drop', () => {
    const moving = clip('c', 0, 0, 2)
    expect(resolveDropStart(track, moving, 8)).toBe(8)
  })
  it('pushes an overlapping drop to the first free slot', () => {
    const moving = clip('c', 0, 0, 2)
    // dropping at 2 overlaps a [0,4) → pushed to 4; then overlaps b [4,8) → 8
    expect(resolveDropStart(track, moving, 2)).toBe(8)
  })
  it('ignores the moving clip itself', () => {
    const moving = track.clips[0]
    expect(resolveDropStart(track, moving, 0)).toBe(0)
  })
  it('clamps negative to 0', () => {
    expect(resolveDropStart({ id: 't', kind: 'video', clips: [] }, clip('c', 0, 0, 2), -5)).toBe(0)
  })
})

describe('appendClip', () => {
  it('appends after the last clip end', () => {
    const track: Track = { id: 't', kind: 'video', clips: [clip('a', 0, 0, 4)] }
    const c = appendClip(track, { id: 'b', sourceId: 's', sourceIn: 0, sourceOut: 3 })
    expect(c.timelineStart).toBe(4)
  })
})

describe('emptyProject', () => {
  it('has a video and an audio track', () => {
    const p = emptyProject()
    expect(p.tracks.map((t) => t.kind)).toEqual(['video', 'audio'])
  })
})
