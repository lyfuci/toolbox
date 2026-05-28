import { describe, it, expect } from 'vitest'
import {
  pathArclength,
  samplePathAtDistance,
  samplePathByArclength,
} from '../bezier-arclength'
import type { PathAnchor } from '../types'

// ── Fixtures ─────────────────────────────────────────────────────────────

// 100px horizontal line — no handles, so the segment degrades to a
// straight line per the "missing handle = line" rule.
const straightLine: PathAnchor[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
]

// Two cubic segments forming a smooth quarter-arc-ish curve, all in the
// upper half-plane so the tangent angle stays monotonically increasing
// (no atan2 wraparound). Start tangent points roughly +x; end tangent
// points roughly +y.
//
// Segment 1: (0,0) → (50,0) with handle pulling up-right then up.
// Segment 2: (50,0) → (100,50) handles tangent-continuous (S-curve free).
// Segment 3: (100,50) → (100,100) handle pulling further along +y.
const quarterArc: PathAnchor[] = [
  { x: 0, y: 0, hout: { x: 30, y: 0 } },
  { x: 50, y: 0, hin: { x: -20, y: 0 }, hout: { x: 20, y: 0 } },
  { x: 100, y: 50, hin: { x: 0, y: -30 }, hout: { x: 0, y: 30 } },
  { x: 100, y: 100, hin: { x: 0, y: -20 } },
]

// ── pathArclength ────────────────────────────────────────────────────────

describe('pathArclength', () => {
  it('returns 100 for a 100px straight segment', () => {
    expect(pathArclength(straightLine, false)).toBeCloseTo(100, 6)
  })

  it('returns a length greater than the chord for a curved path', () => {
    const arc = pathArclength(quarterArc, false)
    // Chord from first to last anchor:
    const chord = Math.hypot(100 - 0, 100 - 0) // ≈ 141.42
    expect(arc).toBeGreaterThan(chord)
  })

  it('returns 0 for a single-anchor path', () => {
    expect(pathArclength([{ x: 5, y: 5 }], false)).toBe(0)
  })

  it('returns 0 for an empty path', () => {
    expect(pathArclength([], false)).toBe(0)
  })

  it('returns 0 for coincident anchors with no handles', () => {
    expect(pathArclength([{ x: 1, y: 1 }, { x: 1, y: 1 }], false)).toBe(0)
  })
})

// ── samplePathByArclength ────────────────────────────────────────────────

describe('samplePathByArclength', () => {
  it('returns evenly-spaced points on a straight line', () => {
    const samples = samplePathByArclength(straightLine, false, 5)
    expect(samples).not.toBeNull()
    if (!samples) return
    expect(samples).toHaveLength(5)
    // 100px / (5-1) = 25px steps, starting at the path start.
    const expectedX = [0, 25, 50, 75, 100]
    for (let i = 0; i < 5; i++) {
      expect(samples[i].x).toBeCloseTo(expectedX[i], 4)
      expect(samples[i].y).toBeCloseTo(0, 6)
    }
  })

  it('returns a constant horizontal tangent on a straight horizontal line', () => {
    const samples = samplePathByArclength(straightLine, false, 5)
    if (!samples) throw new Error('expected samples')
    for (const s of samples) {
      // atan2(0, +x) == 0
      expect(s.tangent).toBeCloseTo(0, 6)
    }
  })

  it('returns samples roughly evenly spaced along a curved path', () => {
    const samples = samplePathByArclength(quarterArc, false, 12)
    expect(samples).not.toBeNull()
    if (!samples) return
    expect(samples).toHaveLength(12)

    const gaps: number[] = []
    for (let i = 1; i < samples.length; i++) {
      const dx = samples[i].x - samples[i - 1].x
      const dy = samples[i].y - samples[i - 1].y
      gaps.push(Math.hypot(dx, dy))
    }
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
    const maxGap = Math.max(...gaps)
    // Arclength sampling: the chord between adjacent samples is a chord
    // approximation of an equal-arclength step, so all gaps should be
    // very close to the mean.
    expect(maxGap).toBeLessThan(1.5 * mean)
  })

  it('rotates tangent monotonically along the quarter-arc fixture', () => {
    const samples = samplePathByArclength(quarterArc, false, 16)
    if (!samples) throw new Error('expected samples')
    // First sample tangent ≈ 0 (along +x), last ≈ π/2 (along +y).
    expect(samples[0].tangent).toBeCloseTo(0, 2)
    expect(samples[samples.length - 1].tangent).toBeCloseTo(Math.PI / 2, 2)
    // Monotone non-decreasing across the run.
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].tangent).toBeGreaterThanOrEqual(samples[i - 1].tangent - 1e-9)
    }
  })

  it('reports t spanning 0..1 across the returned samples', () => {
    const samples = samplePathByArclength(quarterArc, false, 5)
    if (!samples) throw new Error('expected samples')
    expect(samples[0].t).toBeCloseTo(0, 6)
    expect(samples[samples.length - 1].t).toBeCloseTo(1, 6)
  })

  it('returns null for fewer than 2 anchors', () => {
    expect(samplePathByArclength([], false, 5)).toBeNull()
    expect(samplePathByArclength([{ x: 0, y: 0 }], false, 5)).toBeNull()
  })

  it('returns null for a zero-length path', () => {
    expect(
      samplePathByArclength([{ x: 0, y: 0 }, { x: 0, y: 0 }], false, 5),
    ).toBeNull()
  })
})

// ── samplePathAtDistance ─────────────────────────────────────────────────

describe('samplePathAtDistance', () => {
  it('lands at the midpoint on a straight line', () => {
    const total = pathArclength(straightLine, false)
    const mid = samplePathAtDistance(straightLine, false, total / 2)
    expect(mid).not.toBeNull()
    if (!mid) return
    expect(mid.x).toBeCloseTo(50, 4)
    expect(mid.y).toBeCloseTo(0, 6)
    expect(mid.t).toBeCloseTo(0.5, 4)
  })

  it('lands roughly halfway along a curved path', () => {
    const total = pathArclength(quarterArc, false)
    const mid = samplePathAtDistance(quarterArc, false, total / 2)
    expect(mid).not.toBeNull()
    if (!mid) return
    // For our symmetric-ish fixture, halfway should be in the
    // "elbow" — within a sane bounding box around (~75, ~25..50).
    expect(mid.x).toBeGreaterThan(40)
    expect(mid.x).toBeLessThan(100)
    expect(mid.y).toBeGreaterThan(0)
    expect(mid.y).toBeLessThan(80)
    expect(mid.t).toBeCloseTo(0.5, 3)
  })

  it('returns null past the path end', () => {
    const total = pathArclength(straightLine, false)
    expect(samplePathAtDistance(straightLine, false, total + 1)).toBeNull()
  })

  it('returns null for an empty / single-anchor path', () => {
    expect(samplePathAtDistance([], false, 10)).toBeNull()
    expect(samplePathAtDistance([{ x: 0, y: 0 }], false, 10)).toBeNull()
  })

  it('returns null for a zero-length path', () => {
    expect(
      samplePathAtDistance([{ x: 0, y: 0 }, { x: 0, y: 0 }], false, 0),
    ).toBeNull()
  })
})
