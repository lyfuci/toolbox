import { describe, it, expect } from 'vitest'
import {
  splitClipAt,
  rippleDeleteClip,
  snapStart,
  clipDuration,
  clipEnd,
  clipSpeed,
  timelineToSource,
  type Clip,
  type Track,
} from '@/lib/timeline/model'

const clip = (over: Partial<Clip>): Clip => ({
  id: 'c1',
  sourceId: 's1',
  timelineStart: 0,
  sourceIn: 0,
  sourceOut: 10,
  ...over,
})

describe('splitClipAt', () => {
  it('splits a clip into two adjacent, non-overlapping halves', () => {
    const c = clip({ timelineStart: 2, sourceIn: 1, sourceOut: 6 }) // 4s on timeline [2,6)
    const parts = splitClipAt(c, 4) // split 2s in
    expect(parts).not.toBeNull()
    const [l, r] = parts!
    // Left keeps id + start; source window is the first half.
    expect(l.id).toBe('c1')
    expect(l.timelineStart).toBe(2)
    expect(l.sourceIn).toBe(1)
    expect(l.sourceOut).toBe(3) // sourceIn + (4-2)
    // Right gets a new id, starts at the cut, source window is the second half.
    expect(r.id).not.toBe('c1')
    expect(r.timelineStart).toBe(4)
    expect(r.sourceIn).toBe(3)
    expect(r.sourceOut).toBe(6)
    // Durations add up; no overlap at the cut (left end == right start).
    expect(clipDuration(l) + clipDuration(r)).toBeCloseTo(clipDuration(c))
    expect(clipEnd(l)).toBe(r.timelineStart)
  })
  it('returns null when the cut is at or outside the clip edges', () => {
    const c = clip({ timelineStart: 2, sourceOut: 5 }) // [2,7)
    expect(splitClipAt(c, 2)).toBeNull()
    expect(splitClipAt(c, 7)).toBeNull()
    expect(splitClipAt(c, 1)).toBeNull()
    expect(splitClipAt(c, 8)).toBeNull()
  })
})

describe('rippleDeleteClip', () => {
  const track = (): Track => ({
    id: 't1',
    kind: 'video',
    clips: [
      clip({ id: 'a', timelineStart: 0, sourceIn: 0, sourceOut: 3 }), // [0,3)
      clip({ id: 'b', timelineStart: 3, sourceIn: 0, sourceOut: 2 }), // [3,5)
      clip({ id: 'c', timelineStart: 5, sourceIn: 0, sourceOut: 4 }), // [5,9)
    ],
  })
  it('removes a clip and pulls later clips left to close the gap', () => {
    const t = rippleDeleteClip(track(), 'b') // b is 2s long
    expect(t.clips.map((c) => c.id)).toEqual(['a', 'c'])
    expect(t.clips.find((c) => c.id === 'a')!.timelineStart).toBe(0) // before — unchanged
    expect(t.clips.find((c) => c.id === 'c')!.timelineStart).toBe(3) // 5 - 2
  })
  it('is a no-op for an unknown clip', () => {
    const t0 = track()
    expect(rippleDeleteClip(t0, 'zzz')).toBe(t0)
  })
})

describe('snapStart', () => {
  it('snaps the leading edge to a nearby candidate', () => {
    expect(snapStart(5.1, 3, [5, 12], 0.2)).toBe(5)
  })
  it('snaps the trailing edge (start adjusts so end lands on candidate)', () => {
    // start 4.1 + dur 3 = 7.1; candidate 7 → start becomes 4.
    expect(snapStart(4.1, 3, [7], 0.2)).toBe(4)
  })
  it('leaves the start unchanged when nothing is within threshold', () => {
    expect(snapStart(5.5, 3, [5, 12], 0.2)).toBe(5.5)
  })
  it('never returns a negative start', () => {
    expect(snapStart(0.05, 3, [0], 0.2)).toBe(0)
  })
})

describe('clip speed', () => {
  it('clipSpeed defaults to 1 and stays positive', () => {
    expect(clipSpeed(clip({}))).toBe(1)
    expect(clipSpeed(clip({ speed: 2 }))).toBe(2)
    expect(clipSpeed(clip({ speed: 0 }))).toBe(1)
    expect(clipSpeed(clip({ speed: -3 }))).toBe(1)
  })
  it('clipDuration shrinks with speed', () => {
    expect(clipDuration(clip({ sourceIn: 0, sourceOut: 10 }))).toBe(10)
    expect(clipDuration(clip({ sourceIn: 0, sourceOut: 10, speed: 2 }))).toBe(5)
    expect(clipDuration(clip({ sourceIn: 0, sourceOut: 10, speed: 0.5 }))).toBe(20)
  })
  it('timelineToSource walks source time at speed rate', () => {
    const c = clip({ timelineStart: 0, sourceIn: 0, sourceOut: 10, speed: 2 })
    expect(timelineToSource(c, 0)).toBe(0)
    expect(timelineToSource(c, 2.5)).toBe(5) // 2.5s timeline → 5s source at 2x
  })
  it('splitClipAt maps the cut through speed', () => {
    const c = clip({ timelineStart: 0, sourceIn: 0, sourceOut: 10, speed: 2 }) // 5s on timeline
    const parts = splitClipAt(c, 2.5)! // half-way
    expect(parts[0].sourceOut).toBe(5) // 2.5s * 2x
    expect(parts[1].sourceIn).toBe(5)
    expect(parts[0].speed).toBe(2)
    expect(parts[1].speed).toBe(2)
    expect(clipDuration(parts[0]) + clipDuration(parts[1])).toBeCloseTo(clipDuration(c))
  })
})
