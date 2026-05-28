// Cubic-bezier arclength sampler backing the editor's Type-on-Path feature.
// Pure math, no DOM. Inputs are the existing `PathAnchor[]` from the vector
// path layer; outputs are sample points with a local tangent so the
// renderer can rotate each glyph to follow the curve.

import type { PathAnchor, Point } from './types'

/**
 * One sample point along the path.
 *
 * - `(x, y)` is the absolute canvas position.
 * - `tangent` is in radians (`atan2(dy, dx)` of the derivative at this
 *   point). The renderer rotates each glyph by this angle so it faces the
 *   local path direction.
 * - `t` is the normalised position over the FULL path, 0..1. Useful for
 *   visualisation / debugging; not strictly needed by the renderer (which
 *   prefers cumulative-distance reasoning).
 */
export type ArcSample = {
  x: number
  y: number
  tangent: number
  /** Normalised distance over the full path, 0..1. */
  t: number
}

/**
 * One precomputed segment. We pre-resolve the four control points (or the
 * two endpoints for a straight segment) here so the hot path — LUT build
 * and bezier-evaluation — never has to re-check `hin` / `hout` presence.
 */
type Segment =
  | {
      kind: 'cubic'
      p0: Point
      p1: Point
      p2: Point
      p3: Point
    }
  | {
      kind: 'line'
      p0: Point
      p3: Point
    }

/** Flat LUT entry: one row of the segment-distance table built up front. */
type LutEntry = {
  /** Which segment this entry belongs to. */
  segIndex: number
  /** Parameter inside that segment, 0..1. */
  tInSeg: number
  /** Cumulative arclength from path start to this point (px). */
  cumDist: number
}

/**
 * Default sub-samples per segment for arclength estimation. A cubic-bezier
 * arclength has no closed form, so we estimate by summing chord lengths
 * across `samplesPerSegment` evenly-spaced t-subdivisions. 32 is plenty
 * for glyph placement on typical UI curves (error well under a pixel for
 * any sane segment); higher values trade speed for accuracy on very long
 * or very curvy segments. Straight segments ignore this and use a single
 * chord (the segment's full length).
 */
const DEFAULT_SAMPLES_PER_SEGMENT = 32

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Sample N points uniformly by ARCLENGTH along a poly-bezier path.
 *
 * Algorithm: build a chord-sum LUT of (`tInSeg`, `cumDist`) entries by
 * sub-sampling each segment evenly in t and accumulating the chord
 * lengths. Then for each of the `count` target distances
 * `i * totalLen / (count - 1)` (endpoint-inclusive, so a 5-sample 100px
 * line produces points at 0/25/50/75/100), binary-search the LUT and lerp
 * `tInSeg` between the bracketing entries. Evaluate the segment's bezier
 * at that t for `(x, y)` and its derivative for the tangent.
 *
 * Returns null for paths with fewer than 2 anchors or zero total length —
 * the caller decides whether to skip rendering or fall back to a single
 * static placement.
 *
 * `samplesPerSegment` (default 32) controls LUT density: higher = closer
 * to true arclength, but the cost is `O(segments * samplesPerSegment)`
 * per call. 32 covers typical glyph placement comfortably.
 */
export function samplePathByArclength(
  anchors: PathAnchor[],
  closed: boolean,
  count: number,
  samplesPerSegment: number = DEFAULT_SAMPLES_PER_SEGMENT,
): ArcSample[] | null {
  if (count < 1) return null
  const built = buildLut(anchors, closed, samplesPerSegment)
  if (!built) return null
  const { segments, lut, totalLen } = built

  // For count === 1 the only meaningful sample is the path start. Using
  // `i / (count - 1)` would divide by zero, so handle that case explicitly.
  if (count === 1) {
    const s = sampleAtDist(segments, lut, totalLen, 0)
    return s ? [s] : null
  }

  const out: ArcSample[] = []
  for (let i = 0; i < count; i++) {
    const dist = (i * totalLen) / (count - 1)
    const s = sampleAtDist(segments, lut, totalLen, dist)
    if (!s) return null
    out.push(s)
  }
  return out
}

/**
 * Sample at a specific cumulative distance from the path start (px).
 *
 * Returns null if the path is empty / zero-length, OR if `distance` falls
 * outside `[0, totalLen]`. The renderer uses this once per glyph,
 * advancing `distance` by the glyph's x-advance; it can decide to clamp
 * (squash glyphs at the end) or skip (drop overflowing glyphs) when the
 * call returns null.
 */
export function samplePathAtDistance(
  anchors: PathAnchor[],
  closed: boolean,
  distance: number,
  samplesPerSegment: number = DEFAULT_SAMPLES_PER_SEGMENT,
): ArcSample | null {
  const built = buildLut(anchors, closed, samplesPerSegment)
  if (!built) return null
  const { segments, lut, totalLen } = built
  if (distance < 0 || distance > totalLen) return null
  return sampleAtDist(segments, lut, totalLen, distance)
}

/**
 * Total arclength of the path in pixels, estimated via the same chord-sum
 * LUT used by the samplers. Returns 0 for empty / single-anchor / fully
 * coincident paths (so the caller can do `len > 0 ?` checks without a
 * null-guard). Pass `samplesPerSegment` higher than the default if the
 * caller needs a tighter estimate.
 */
export function pathArclength(
  anchors: PathAnchor[],
  closed: boolean,
  samplesPerSegment: number = DEFAULT_SAMPLES_PER_SEGMENT,
): number {
  const built = buildLut(anchors, closed, samplesPerSegment)
  return built ? built.totalLen : 0
}

// ── Internals ────────────────────────────────────────────────────────────

/**
 * Resolve the anchor list into a flat segment list, then sub-sample each
 * segment and accumulate chord lengths into a LUT. Returns null on
 * degenerate input (< 2 anchors or zero total length) so the callers all
 * share one short-circuit path.
 */
function buildLut(
  anchors: PathAnchor[],
  closed: boolean,
  samplesPerSegment: number,
): { segments: Segment[]; lut: LutEntry[]; totalLen: number } | null {
  if (!anchors || anchors.length < 2) return null
  const segments = buildSegments(anchors, closed)
  if (segments.length === 0) return null
  const subs = Math.max(1, Math.floor(samplesPerSegment))

  const lut: LutEntry[] = []
  let cumDist = 0

  // Seed with the path start so a distance of 0 lerps cleanly against the
  // first real sub-sample (avoids a special-case at the LUT head).
  lut.push({ segIndex: 0, tInSeg: 0, cumDist: 0 })

  for (let segIndex = 0; segIndex < segments.length; segIndex++) {
    const seg = segments[segIndex]
    // Previous accumulated point in absolute coords — start of the segment.
    let prev = evalSegment(seg, 0)
    for (let k = 1; k <= subs; k++) {
      const tInSeg = k / subs
      const cur = evalSegment(seg, tInSeg)
      const dx = cur.x - prev.x
      const dy = cur.y - prev.y
      cumDist += Math.hypot(dx, dy)
      lut.push({ segIndex, tInSeg, cumDist })
      prev = cur
    }
  }

  // Defend against fully-degenerate input (e.g. all anchors coincident
  // with no handles). Without this, downstream lerps divide by zero.
  if (cumDist === 0) return null
  return { segments, lut, totalLen: cumDist }
}

/**
 * Walk anchor pairs and produce one Segment per pair (plus a closing
 * segment when `closed` is true). A pair becomes a CUBIC bezier only when
 * the leaving anchor has `hout` AND the arriving anchor has `hin`;
 * anything else degrades to a straight line. This matches the rule in
 * the task spec — single-handle pairs are treated as lines so we don't
 * have to invent a phantom control point on the missing side.
 */
function buildSegments(anchors: PathAnchor[], closed: boolean): Segment[] {
  const out: Segment[] = []
  const n = anchors.length
  const pairCount = closed ? n : n - 1
  for (let i = 0; i < pairCount; i++) {
    const a = anchors[i]
    const b = anchors[(i + 1) % n]
    const p0: Point = { x: a.x, y: a.y }
    const p3: Point = { x: b.x, y: b.y }
    if (a.hout && b.hin) {
      out.push({
        kind: 'cubic',
        p0,
        p1: { x: a.x + a.hout.x, y: a.y + a.hout.y },
        p2: { x: b.x + b.hin.x, y: b.y + b.hin.y },
        p3,
      })
    } else {
      out.push({ kind: 'line', p0, p3 })
    }
  }
  return out
}

/**
 * Cubic-bezier evaluation in Bernstein form:
 *   B(t) = (1−t)³·P0 + 3(1−t)²t·P1 + 3(1−t)t²·P2 + t³·P3
 * Cheaper for one-shot evaluation than recursive De Casteljau (no
 * intermediate allocations) and numerically fine for t ∈ [0, 1].
 *
 * Lines are evaluated as a plain `lerp(p0, p3, t)`.
 */
function evalSegment(seg: Segment, t: number): Point {
  if (seg.kind === 'line') {
    return {
      x: seg.p0.x + (seg.p3.x - seg.p0.x) * t,
      y: seg.p0.y + (seg.p3.y - seg.p0.y) * t,
    }
  }
  const u = 1 - t
  const b0 = u * u * u
  const b1 = 3 * u * u * t
  const b2 = 3 * u * t * t
  const b3 = t * t * t
  return {
    x: b0 * seg.p0.x + b1 * seg.p1.x + b2 * seg.p2.x + b3 * seg.p3.x,
    y: b0 * seg.p0.y + b1 * seg.p1.y + b2 * seg.p2.y + b3 * seg.p3.y,
  }
}

/**
 * Derivative of the segment at parameter t — used for the per-sample
 * tangent angle. Cubic:
 *   B'(t) = 3(1−t)²·(P1−P0) + 6(1−t)t·(P2−P1) + 3t²·(P3−P2)
 * Line: constant direction `(p3 − p0)`.
 *
 * The result is NOT normalised — the caller only needs `atan2(dy, dx)`,
 * which is invariant to magnitude.
 */
function evalSegmentDerivative(seg: Segment, t: number): Point {
  if (seg.kind === 'line') {
    return { x: seg.p3.x - seg.p0.x, y: seg.p3.y - seg.p0.y }
  }
  const u = 1 - t
  const c0 = 3 * u * u
  const c1 = 6 * u * t
  const c2 = 3 * t * t
  return {
    x:
      c0 * (seg.p1.x - seg.p0.x) +
      c1 * (seg.p2.x - seg.p1.x) +
      c2 * (seg.p3.x - seg.p2.x),
    y:
      c0 * (seg.p1.y - seg.p0.y) +
      c1 * (seg.p2.y - seg.p1.y) +
      c2 * (seg.p3.y - seg.p2.y),
  }
}

/**
 * Given a target cumulative distance, binary-search the LUT for the
 * bracketing pair, lerp `tInSeg` between them, then evaluate the bezier
 * and its derivative for the output sample. We lerp on the in-segment t
 * (NOT a path-global t) because the bezier is parameterised per segment,
 * and the LUT entries we land in always share the same `segIndex` for
 * any non-boundary lookup. At segment boundaries the two neighbours
 * disagree on segIndex — we pick the higher-index one so a distance
 * exactly equal to a boundary lands at the start of the next segment,
 * giving a well-defined tangent (the segment START tangent rather than
 * the END tangent of the previous segment).
 */
function sampleAtDist(
  segments: Segment[],
  lut: LutEntry[],
  totalLen: number,
  distance: number,
): ArcSample | null {
  // Snap micro-overruns from float arithmetic in the caller.
  const d = Math.max(0, Math.min(distance, totalLen))

  // Binary search for the first LUT entry whose cumDist >= d.
  let lo = 0
  let hi = lut.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (lut[mid].cumDist < d) lo = mid + 1
    else hi = mid
  }
  const upperIdx = lo
  const lowerIdx = upperIdx === 0 ? 0 : upperIdx - 1
  const upper = lut[upperIdx]
  const lower = lut[lowerIdx]

  let segIndex: number
  let tInSeg: number
  if (upper === lower) {
    segIndex = upper.segIndex
    tInSeg = upper.tInSeg
  } else if (lower.segIndex !== upper.segIndex) {
    // Crossing a segment boundary — the in-segment t isn't comparable
    // across the two entries, so we just snap to the start of the upper
    // segment (which is also the end of the lower one — same position).
    segIndex = upper.segIndex
    tInSeg = upper.tInSeg
  } else {
    const span = upper.cumDist - lower.cumDist
    const frac = span > 0 ? (d - lower.cumDist) / span : 0
    segIndex = upper.segIndex
    tInSeg = lower.tInSeg + (upper.tInSeg - lower.tInSeg) * frac
  }

  const seg = segments[segIndex]
  const pt = evalSegment(seg, tInSeg)
  const dv = evalSegmentDerivative(seg, tInSeg)
  return {
    x: pt.x,
    y: pt.y,
    tangent: Math.atan2(dv.y, dv.x),
    t: totalLen > 0 ? d / totalLen : 0,
  }
}
