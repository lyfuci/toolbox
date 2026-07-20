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

type History = { past: Project[]; future: Project[] }
const EMPTY_HISTORY: History = { past: [], future: [] }

/**
 * React state for the timeline editor: a Project plus the loaded source files
 * (kept outside the serializable Project so the model stays pure) and an
 * undo/redo history.
 *
 * Every Project change goes through one of two paths:
 *  - `commit(updater)` — a discrete edit (split, delete, add clip/track/marker,
 *    toggle mute). Pushes the pre-change Project onto the undo stack.
 *  - `transient(updater)` — a live drag step (move/trim/volume). Updates the
 *    Project WITHOUT touching history; the surrounding drag is bracketed by
 *    `beginInteraction()` / `endInteraction()`, which snapshot the pre-drag
 *    Project once at the start and commit a SINGLE history entry at the end
 *    (skipping no-op drags). This is why move/trim being delta-accumulative is
 *    fine — we snapshot absolute state, never diff per pointer event.
 *
 * The current Project + history live in refs (mirrored to state for rendering)
 * so rapid successive edits stay consistent within a tick. Sources live outside
 * the Project, so they're correctly excluded from undo.
 */
export function useTimeline() {
  const [project, setProject] = useState<Project>(() => emptyProject())
  const [sources, setSources] = useState<Record<string, LoadedSource>>({})
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [history, setHistory] = useState<History>(EMPTY_HISTORY)

  const sourcesRef = useRef(sources)
  useEffect(() => {
    sourcesRef.current = sources
  }, [sources])

  const projectRef = useRef(project)
  const historyRef = useRef(history)
  const pendingRef = useRef<Project | null>(null)
  useEffect(() => {
    projectRef.current = project
  }, [project])
  useEffect(() => {
    historyRef.current = history
  }, [history])

  const applyProject = useCallback((next: Project) => {
    projectRef.current = next
    setProject(next)
  }, [])
  const applyHistory = useCallback((next: History) => {
    historyRef.current = next
    setHistory(next)
  }, [])

  // Discrete edit: record history then apply. No-op updaters are ignored.
  const commit = useCallback(
    (updater: (p: Project) => Project) => {
      const prev = projectRef.current
      const next = updater(prev)
      if (next === prev) return
      applyHistory({ past: [...historyRef.current.past, prev], future: [] })
      applyProject(next)
    },
    [applyHistory, applyProject],
  )

  // Live drag step: apply without recording (history is committed on drag end).
  const transient = useCallback(
    (updater: (p: Project) => Project) => {
      const prev = projectRef.current
      const next = updater(prev)
      if (next === prev) return
      applyProject(next)
    },
    [applyProject],
  )

  const beginInteraction = useCallback(() => {
    pendingRef.current = projectRef.current
  }, [])
  const endInteraction = useCallback(() => {
    const snap = pendingRef.current
    pendingRef.current = null
    if (!snap) return
    const cur = projectRef.current
    // Only record if the drag actually changed something (skip click-no-drag).
    if (snap !== cur && JSON.stringify(snap) !== JSON.stringify(cur)) {
      applyHistory({ past: [...historyRef.current.past, snap], future: [] })
    }
  }, [applyHistory])

  const undo = useCallback(() => {
    const h = historyRef.current
    if (!h.past.length) return
    const prev = h.past[h.past.length - 1]
    const cur = projectRef.current
    applyHistory({ past: h.past.slice(0, -1), future: [cur, ...h.future] })
    applyProject(prev)
  }, [applyHistory, applyProject])
  const redo = useCallback(() => {
    const h = historyRef.current
    if (!h.future.length) return
    const next = h.future[0]
    const cur = projectRef.current
    applyHistory({ past: [...h.past, cur], future: h.future.slice(1) })
    applyProject(next)
  }, [applyHistory, applyProject])

  const addSource = useCallback((src: LoadedSource) => {
    setSources((prev) => ({ ...prev, [src.id]: src }))
  }, [])

  /**
   * Add a source's whole span as a clip on the first track of its kind.
   * Accepts the source object directly (so it works in the same tick as
   * addSource, before the sources state/ref has flushed); falls back to the ref.
   */
  const addClipFromSource = useCallback(
    (sourceIdOrSource: string | LoadedSource) => {
      commit((p) => {
        const src =
          typeof sourceIdOrSource === 'string' ? sourcesRef.current[sourceIdOrSource] : sourceIdOrSource
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
    },
    [commit],
  )

  const moveClip = useCallback(
    (clipId: string, trackId: string, requestedStart: number) => {
      transient((p) => {
        const tracks = p.tracks.map((t) => ({ ...t, clips: [...t.clips] }))
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
    },
    [transient],
  )

  const trimClip = useCallback(
    (clipId: string, edge: 'in' | 'out', deltaSec: number) => {
      transient((p) => ({
        ...p,
        tracks: p.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => {
            if (c.id !== clipId) return c
            const src = sourcesRef.current[c.sourceId]
            const maxOut = src ? src.duration : c.sourceOut
            if (edge === 'in') {
              const nextIn = Math.min(Math.max(0, c.sourceIn + deltaSec), c.sourceOut - 0.1)
              return { ...c, sourceIn: nextIn, timelineStart: c.timelineStart + (nextIn - c.sourceIn) }
            }
            const nextOut = Math.max(Math.min(maxOut, c.sourceOut + deltaSec), c.sourceIn + 0.1)
            return { ...c, sourceOut: nextOut }
          }),
        })),
      }))
    },
    [transient],
  )

  const removeClip = useCallback(
    (clipId: string) => {
      commit((p) => ({
        ...p,
        tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) })),
      }))
      setSelectedClipId((cur) => (cur === clipId ? null : cur))
    },
    [commit],
  )

  // Blade every track's clip that straddles time `t` (DaVinci behaviour). Clips
  // not under the playhead are left untouched; a cut on an edge is a no-op.
  const splitAtPlayhead = useCallback(
    (t: number) => {
      commit((p) => {
        let changed = false
        const tracks = p.tracks.map((tr) => {
          if (tr.locked) return tr // locked tracks aren't bladed
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
          return { ...tr, clips }
        })
        return changed ? { ...p, tracks } : p
      })
    },
    [commit],
  )

  // Ripple delete — remove the clip and close the gap on its track.
  const rippleRemoveClip = useCallback(
    (clipId: string) => {
      commit((p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.clips.some((c) => c.id === clipId) ? rippleDeleteClip(t, clipId) : t)),
      }))
      setSelectedClipId((cur) => (cur === clipId ? null : cur))
    },
    [commit],
  )

  // Nudge a clip by a signed delta on its own track (keyboard , / .).
  const nudgeClip = useCallback(
    (clipId: string, deltaSec: number) => {
      commit((p) => {
        const tracks = p.tracks.map((t) => ({ ...t, clips: [...t.clips] }))
        let moving: Clip | undefined
        let srcTrack: (typeof tracks)[number] | undefined
        for (const t of tracks) {
          const i = t.clips.findIndex((c) => c.id === clipId)
          if (i >= 0) {
            moving = t.clips[i]
            srcTrack = t
            t.clips.splice(i, 1)
            break
          }
        }
        if (!moving || !srcTrack) return p
        const start = resolveDropStart(srcTrack, moving, Math.max(0, moving.timelineStart + deltaSec))
        srcTrack.clips.push({ ...moving, timelineStart: start })
        return { ...p, tracks }
      })
    },
    [commit],
  )

  // Duplicate a clip immediately after itself on the same track; selects the copy.
  const duplicateClip = useCallback(
    (clipId: string) => {
      let placedId: string | null = null
      commit((p) => {
        const tracks = p.tracks.map((t) => ({ ...t, clips: [...t.clips] }))
        for (const t of tracks) {
          const src = t.clips.find((c) => c.id === clipId)
          if (!src) continue
          const copy: Clip = { ...src, id: newId('clip'), timelineStart: src.timelineStart + clipDuration(src) }
          const start = resolveDropStart(t, copy, copy.timelineStart)
          const placed = { ...copy, timelineStart: start }
          t.clips.push(placed)
          placedId = placed.id
          return { ...p, tracks }
        }
        return p
      })
      if (placedId) setSelectedClipId(placedId)
    },
    [commit],
  )

  // Insert a clip (from the clipboard) onto the first track of `kind` at `atTime`.
  const insertClip = useCallback(
    (kind: Track['kind'], data: Pick<Clip, 'sourceId' | 'sourceIn' | 'sourceOut' | 'volume'>, atTime: number) => {
      let placedId: string | null = null
      commit((p) => {
        const tracks = p.tracks.map((t) => ({ ...t, clips: [...t.clips] }))
        let track = tracks.find((t) => t.kind === kind)
        if (!track) {
          track = { id: newId('trk'), kind, clips: [] }
          tracks.push(track)
        }
        const clip: Clip = { ...data, id: newId('clip'), timelineStart: 0 }
        const start = resolveDropStart(track, clip, Math.max(0, atTime))
        const placed = { ...clip, timelineStart: start }
        track.clips.push(placed)
        placedId = placed.id
        return { ...p, tracks }
      })
      if (placedId) setSelectedClipId(placedId)
    },
    [commit],
  )

  // Volume is a slider drag — transient; the slider brackets it with
  // begin/endInteraction so the whole drag is one undo entry.
  const setClipVolume = useCallback(
    (clipId: string, volume: number) => {
      transient((p) => ({
        ...p,
        tracks: p.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, volume } : c)),
        })),
      }))
    },
    [transient],
  )

  const toggleTrackMute = useCallback(
    (trackId: string) => {
      commit((p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)),
      }))
    },
    [commit],
  )

  const toggleTrackSolo = useCallback(
    (trackId: string) => {
      commit((p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, solo: !t.solo } : t)),
      }))
    },
    [commit],
  )

  const toggleTrackLock = useCallback(
    (trackId: string) => {
      commit((p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, locked: !t.locked } : t)),
      }))
    },
    [commit],
  )

  const removeTrack = useCallback(
    (trackId: string) => {
      commit((p) => (p.tracks.length <= 1 ? p : { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) }))
    },
    [commit],
  )

  const addTrack = useCallback(
    (kind: Track['kind']) => {
      commit((p) => ({ ...p, tracks: [...p.tracks, { id: newId('trk'), kind, clips: [] }] }))
    },
    [commit],
  )

  const setResolution = useCallback(
    (width: number, height: number) => {
      commit((p) => (p.width === width && p.height === height ? p : { ...p, width, height }))
    },
    [commit],
  )

  const addMarker = useCallback(
    (t: number) => {
      commit((p) => ({ ...p, markers: [...(p.markers ?? []), { id: newId('mk'), time: t }] }))
    },
    [commit],
  )

  const removeMarker = useCallback(
    (id: string) => {
      commit((p) => ({ ...p, markers: (p.markers ?? []).filter((m) => m.id !== id) }))
    },
    [commit],
  )

  const reset = useCallback(() => {
    applyProject(emptyProject())
    applyHistory(EMPTY_HISTORY)
    setSources({})
    setSelectedClipId(null)
  }, [applyProject, applyHistory])

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
    nudgeClip,
    duplicateClip,
    insertClip,
    setClipVolume,
    toggleTrackMute,
    toggleTrackSolo,
    toggleTrackLock,
    removeTrack,
    addTrack,
    setResolution,
    addMarker,
    removeMarker,
    beginInteraction,
    endInteraction,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    reset,
    duration: projectDuration(project),
    clipDuration,
  }
}
