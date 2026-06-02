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
}

export type TrackKind = 'video' | 'audio'

export type Track = {
  id: TrackId
  kind: TrackKind
  clips: Clip[]
  muted?: boolean
  hidden?: boolean
}

export type Project = {
  width: number
  height: number
  fps: number
  tracks: Track[]
}

export const clipDuration = (c: Clip): number => Math.max(0, c.sourceOut - c.sourceIn)
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
  return clip.sourceIn + (t - clip.timelineStart)
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
