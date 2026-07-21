/**
 * Timeline data model for the Media Studio (剪映/CapCut-style) editor.
 *
 * Pure, serializable types + helpers. The preview engine (browser <video> +
 * canvas + WebAudio) and the export engine (ffmpeg.wasm filter_complex) are
 * separate consumers that share ONLY this model — see export-graph.ts.
 *
 * Time is in seconds throughout. A clip references a source and carries:
 *  - timelineStart: where it sits on the timeline
 *  - sourceIn / sourceOut: the trimmed window within the source
 * so its on-timeline duration is (sourceOut - sourceIn).
 */

export type SourceId = string
export type ClipId = string
export type TrackId = string

export type Source = {
  id: SourceId
  name: string
  duration: number
  hasVideo: boolean
  hasAudio: boolean
  width?: number
  height?: number
}

export type Clip = {
  id: ClipId
  sourceId: SourceId
  timelineStart: number
  sourceIn: number
  sourceOut: number
  /** Linear gain for audio of this clip (1 = unchanged). */
  volume?: number
  /** Fade-in / fade-out durations in seconds (video → from/to black; audio → gain ramp). */
  fadeIn?: number
  fadeOut?: number
  /** Playback speed (1 = normal). >1 shortens the clip on the timeline. */
  speed?: number
}

/** Playback speed of a clip, always a positive number (default 1). */
export const clipSpeed = (c: Clip): number => (c.speed && c.speed > 0 ? c.speed : 1)

/** Fade multiplier in [0,1] for a clip at timeline time `t` (1 = no fade here). */
export function fadeFactor(clip: Clip, t: number): number {
  const start = clip.timelineStart
  const end = clipEnd(clip)
  let f = 1
  if (clip.fadeIn && clip.fadeIn > 0 && t < start + clip.fadeIn) {
    f = Math.min(f, Math.max(0, (t - start) / clip.fadeIn))
  }
  if (clip.fadeOut && clip.fadeOut > 0 && t > end - clip.fadeOut) {
    f = Math.min(f, Math.max(0, (end - t) / clip.fadeOut))
  }
  return f
}

export type TrackKind = 'video' | 'audio'

export type Track = {
  id: TrackId
  kind: TrackKind
  clips: Clip[]
  muted?: boolean
  hidden?: boolean
  solo?: boolean
  locked?: boolean
}

/** A track is audible if not muted and (nothing soloed, or it is soloed). */
export function trackAudible(track: Track, anySolo: boolean): boolean {
  return !track.muted && (!anySolo || !!track.solo)
}

export type Marker = {
  id: string
  time: number
  label?: string
}

export type Project = {
  width: number
  height: number
  fps: number
  tracks: Track[]
  markers?: Marker[]
}

// On-timeline duration: the source window compressed/expanded by playback speed.
export const clipDuration = (c: Clip): number => Math.max(0, (c.sourceOut - c.sourceIn) / clipSpeed(c))
export const clipEnd = (c: Clip): number => c.timelineStart + clipDuration(c)

/** Total timeline length = max end across all clips on all tracks. */
export function projectDuration(p: Project): number {
  let max = 0
  for (const t of p.tracks) for (const c of t.clips) max = Math.max(max, clipEnd(c))
  return max
}

/** Clips on a track, sorted by start (does not mutate). */
export function sortedClips(track: Track): Clip[] {
  return [...track.clips].sort((a, b) => a.timelineStart - b.timelineStart)
}

/** Whether two clips overlap in timeline time. */
export function clipsOverlap(a: Clip, b: Clip): boolean {
  return a.timelineStart < clipEnd(b) && b.timelineStart < clipEnd(a)
}

/**
 * The clip active at time `t` on a track (last one wins if somehow overlapping,
 * which the editor prevents). Returns null in a gap.
 */
export function clipAt(track: Track, t: number): Clip | null {
  let found: Clip | null = null
  for (const c of track.clips) {
    if (t >= c.timelineStart && t < clipEnd(c)) found = c
  }
  return found
}

/**
 * Map a timeline time to the source time for a clip (for preview seeking):
 * sourceIn + (t - timelineStart). Caller ensures t is within the clip.
 */
export function timelineToSource(clip: Clip, t: number): number {
  return clip.sourceIn + (t - clip.timelineStart) * clipSpeed(clip)
}

let counter = 0
/** Deterministic-ish id; crypto.randomUUID in the browser, fallback for tests. */
export function newId(prefix = 'id'): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return `${prefix}_${c.randomUUID().slice(0, 8)}`
  counter += 1
  return `${prefix}_${counter}`
}

export function emptyProject(width = 1280, height = 720, fps = 30): Project {
  return {
    width,
    height,
    fps,
    tracks: [
      { id: newId('trk'), kind: 'video', clips: [] },
      { id: newId('trk'), kind: 'audio', clips: [] },
    ],
  }
}

/** Append a clip to the end of a track, snapped after the last clip. */
export function appendClip(track: Track, clip: Omit<Clip, 'timelineStart'>): Clip {
  const end = track.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0)
  return { ...clip, timelineStart: end }
}

/**
 * Resolve a clip's timelineStart so it doesn't overlap others on the track:
 * if the requested start overlaps, push it to the first free slot at/after it.
 * Returns the adjusted start. Pure (does not mutate the track).
 */
export function resolveDropStart(track: Track, moving: Clip, requestedStart: number): number {
  const others = track.clips.filter((c) => c.id !== moving.id).sort((a, b) => a.timelineStart - b.timelineStart)
  const dur = clipDuration(moving)
  let start = Math.max(0, requestedStart)
  for (const o of others) {
    const oStart = o.timelineStart
    const oEnd = clipEnd(o)
    // If [start, start+dur) overlaps [oStart, oEnd), move start to oEnd.
    if (start < oEnd && oStart < start + dur) start = oEnd
  }
  return start
}

const SPLIT_EPS = 1e-4

/**
 * Split a clip at timeline time `t` into [left, right] sharing the same source
 * (left keeps the id, right gets a fresh one). Returns null if `t` isn't
 * strictly inside the clip. Export-safe: two adjacent source windows render as
 * two independent trims/overlays in export-graph.ts (clipEnd is exclusive, so
 * the halves never overlap at the cut).
 */
export function splitClipAt(clip: Clip, t: number): [Clip, Clip] | null {
  const start = clip.timelineStart
  const end = clipEnd(clip)
  if (t <= start + SPLIT_EPS || t >= end - SPLIT_EPS) return null
  // Map the cut back to source time through the clip's speed.
  const srcSplit = clip.sourceIn + (t - start) * clipSpeed(clip)
  const left: Clip = { ...clip, sourceOut: srcSplit }
  const right: Clip = { ...clip, id: newId('clip'), sourceIn: srcSplit, timelineStart: t }
  return [left, right]
}

/**
 * Remove a clip and pull every later clip on the same track left by its
 * duration, closing the gap (DaVinci "ripple delete"). Pure; returns a new
 * Track. No-op if the clip isn't on the track.
 */
export function rippleDeleteClip(track: Track, clipId: ClipId): Track {
  const removed = track.clips.find((c) => c.id === clipId)
  if (!removed) return track
  const dur = clipDuration(removed)
  const start = removed.timelineStart
  const clips = track.clips
    .filter((c) => c.id !== clipId)
    .map((c) => (c.timelineStart >= start ? { ...c, timelineStart: Math.max(0, c.timelineStart - dur) } : c))
  return { ...track, clips }
}

/**
 * Snap a clip's proposed start so its leading OR trailing edge lands on the
 * nearest `candidate` within `threshold` seconds. Returns the adjusted start
 * (>= 0), unchanged if nothing is close. Pure — used by the drag math so a
 * moved clip clicks onto the playhead / adjacent clip edges.
 */
export function snapStart(start: number, dur: number, candidates: number[], threshold: number): number {
  let best = start
  let bestDist = threshold
  for (const cand of candidates) {
    const dLead = Math.abs(start - cand)
    if (dLead < bestDist) {
      bestDist = dLead
      best = cand
    }
    const dTrail = Math.abs(start + dur - cand)
    if (dTrail < bestDist) {
      bestDist = dTrail
      best = cand - dur
    }
  }
  return Math.max(0, best)
}
