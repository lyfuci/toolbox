import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type Project,
  type Source,
  type Clip,
  type Track,
  emptyProject,
  newId,
  appendClip,
  resolveDropStart,
  splitClipAt,
  rippleDeleteClip,
  clipDuration,
  projectDuration,
} from '@/lib/timeline/model'

export type LoadedSource = Source & { file: File; url: string }

/**
 * React state for the timeline editor: a Project plus the loaded source files
 * (kept outside the serializable Project so model stays pure). All mutations go
 * through these callbacks so undo/serialization can be layered on later.
 */
export function useTimeline() {
  const [project, setProject] = useState<Project>(() => emptyProject())
  const [sources, setSources] = useState<Record<string, LoadedSource>>({})
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  // Mirror sources into a ref so the setProject callbacks (which capture stale
  // closures) can read the latest sources without re-creating the callbacks.
  const sourcesRef = useRef(sources)
  useEffect(() => {
    sourcesRef.current = sources
  }, [sources])

  const addSource = useCallback((src: LoadedSource) => {
    setSources((prev) => ({ ...prev, [src.id]: src }))
  }, [])

  /**
   * Add a source's whole span as a clip on the first track of its kind.
   * Accepts the source object directly (so it works in the same tick as
   * addSource, before the sources state/ref has flushed); falls back to the ref.
   */
  const addClipFromSource = useCallback((sourceIdOrSource: string | LoadedSource) => {
    setProject((p) => {
      const src =
        typeof sourceIdOrSource === 'string'
          ? sourcesRef.current[sourceIdOrSource]
          : sourceIdOrSource
      if (!src) return p
      const sourceId = src.id
      const kind: Track['kind'] = src.hasVideo ? 'video' : 'audio'
      const tracks = p.tracks.map((t) => ({ ...t, clips: [...t.clips] }))
      let track = tracks.find((t) => t.kind === kind)
      if (!track) {
        track = { id: newId('trk'), kind, clips: [] }
        tracks.push(track)
      }
      const clip = appendClip(track, {
        id: newId('clip'),
        sourceId,
        sourceIn: 0,
        sourceOut: src.duration,
        volume: 1,
      })
      track.clips.push(clip)
      return { ...p, tracks }
    })
  }, [])

  const moveClip = useCallback((clipId: string, trackId: string, requestedStart: number) => {
    setProject((p) => {
      const tracks = p.tracks.map((t) => ({ ...t, clips: [...t.clips] }))
      // Find and detach the clip.
      let moving: Clip | undefined
      for (const t of tracks) {
        const i = t.clips.findIndex((c) => c.id === clipId)
        if (i >= 0) {
          moving = t.clips[i]
          t.clips.splice(i, 1)
          break
        }
      }
      if (!moving) return p
      const target = tracks.find((t) => t.id === trackId)
      if (!target) return p
      const start = resolveDropStart(target, moving, requestedStart)
      target.clips.push({ ...moving, timelineStart: start })
      return { ...p, tracks }
    })
  }, [])

  const trimClip = useCallback((clipId: string, edge: 'in' | 'out', deltaSec: number) => {
    setProject((p) => {
      const tracks = p.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id !== clipId) return c
          const src = sourcesRef.current[c.sourceId]
          const maxOut = src ? src.duration : c.sourceOut
          if (edge === 'in') {
            const nextIn = Math.min(Math.max(0, c.sourceIn + deltaSec), c.sourceOut - 0.1)
            // Trimming the in-point also shifts the clip on the timeline.
            return { ...c, sourceIn: nextIn, timelineStart: c.timelineStart + (nextIn - c.sourceIn) }
          }
          const nextOut = Math.max(Math.min(maxOut, c.sourceOut + deltaSec), c.sourceIn + 0.1)
          return { ...c, sourceOut: nextOut }
        }),
      }))
      return { ...p, tracks }
    })
  }, [])

  const removeClip = useCallback((clipId: string) => {
    setProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) })),
    }))
    setSelectedClipId((cur) => (cur === clipId ? null : cur))
  }, [])

  // Blade every track's clip that straddles time `t` (DaVinci behaviour). Clips
  // not under the playhead are left untouched; a cut on an edge is a no-op.
  const splitAtPlayhead = useCallback((t: number) => {
    setProject((p) => {
      let changed = false
      const tracks = p.tracks.map((tr) => {
        const clips: Clip[] = []
        for (const c of tr.clips) {
          const parts = splitClipAt(c, t)
          if (parts) {
            clips.push(parts[0], parts[1])
            changed = true
          } else {
            clips.push(c)
          }
        }
        return changed ? { ...tr, clips } : tr
      })
      return changed ? { ...p, tracks } : p
    })
  }, [])

  // Ripple delete — remove the clip and close the gap on its track.
  const rippleRemoveClip = useCallback((clipId: string) => {
    setProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.clips.some((c) => c.id === clipId) ? rippleDeleteClip(t, clipId) : t)),
    }))
    setSelectedClipId((cur) => (cur === clipId ? null : cur))
  }, [])

  const setClipVolume = useCallback((clipId: string, volume: number) => {
    setProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? { ...c, volume } : c)),
      })),
    }))
  }, [])

  const toggleTrackMute = useCallback((trackId: string) => {
    setProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)),
    }))
  }, [])

  const addTrack = useCallback((kind: Track['kind']) => {
    setProject((p) => ({ ...p, tracks: [...p.tracks, { id: newId('trk'), kind, clips: [] }] }))
  }, [])

  const addMarker = useCallback((t: number) => {
    setProject((p) => ({ ...p, markers: [...(p.markers ?? []), { id: newId('mk'), time: t }] }))
  }, [])

  const removeMarker = useCallback((id: string) => {
    setProject((p) => ({ ...p, markers: (p.markers ?? []).filter((m) => m.id !== id) }))
  }, [])

  const reset = useCallback(() => {
    setProject(emptyProject())
    setSources({})
    setSelectedClipId(null)
  }, [])

  return {
    project,
    sources,
    selectedClipId,
    setSelectedClipId,
    addSource,
    addClipFromSource,
    moveClip,
    trimClip,
    removeClip,
    splitAtPlayhead,
    rippleRemoveClip,
    setClipVolume,
    toggleTrackMute,
    addTrack,
    addMarker,
    removeMarker,
    reset,
    duration: projectDuration(project),
    clipDuration,
  }
}
