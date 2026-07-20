import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Volume2, VolumeX } from 'lucide-react'
import { type Project, type Clip, type Track, clipDuration, clipEnd, snapStart } from '@/lib/timeline/model'
import type { LoadedSource } from './useTimeline'
import { cn } from '@/lib/utils'

const TRACK_H = 60
const RULER_H = 26
// Pointer distance (px) within which a dragged clip edge clicks onto a snap
// target (adjacent clip edges + the playhead).
const SNAP_PX = 8

// Compact ruler label — ticks land on whole seconds, so MM:SS reads cleaner
// than a full HH:MM:SS:FF timecode (the transport readout carries the frames).
const tcLabel = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s) % 60).padStart(2, '0')}`

type Props = {
  project: Project
  sources: Record<string, LoadedSource>
  pxPerSec: number
  time: number
  selectedClipId: string | null
  snap: boolean
  onSeek: (t: number) => void
  onSelectClip: (id: string | null) => void
  onMoveClip: (clipId: string, trackId: string, start: number) => void
  onTrimClip: (clipId: string, edge: 'in' | 'out', deltaSec: number) => void
  onToggleMute: (trackId: string) => void
}

export function Timeline({
  project,
  sources,
  pxPerSec,
  time,
  selectedClipId,
  snap,
  onSeek,
  onSelectClip,
  onMoveClip,
  onTrimClip,
  onToggleMute,
}: Props) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const total = Math.max(project.tracks.reduce((m, tr) => Math.max(m, tr.clips.reduce((mm, c) => Math.max(mm, c.timelineStart + clipDuration(c)), 0)), 0), 10)
  const width = total * pxPerSec

  // Snap candidates: every clip edge + the playhead + 0. Captured per drag at
  // pointer-down (the dragged clip excludes its own edges) so it stays stable.
  const snapTargets = useMemo(() => {
    const set = new Set<number>([0, time])
    for (const tr of project.tracks) {
      for (const c of tr.clips) {
        set.add(c.timelineStart)
        set.add(clipEnd(c))
      }
    }
    return [...set]
  }, [project, time])

  // Ruler ticks every second (label every 5s when dense).
  const ticks = []
  const step = pxPerSec < 20 ? 5 : 1
  for (let s = 0; s <= total; s += step) ticks.push(s)

  const seekFromEvent = (clientX: number) => {
    const el = scrollRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left + el.scrollLeft
    onSeek(Math.max(0, x / pxPerSec))
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-[var(--nle-timeline)]" ref={scrollRef}>
      <div style={{ width, minWidth: '100%' }}>
        {/* Ruler */}
        <div
          className="relative cursor-pointer border-b border-border bg-[var(--nle-ruler)]"
          style={{ height: RULER_H }}
          onPointerDown={(e) => seekFromEvent(e.clientX)}
        >
          {ticks.map((s) => (
            <div key={s} className="absolute top-0 h-full border-l border-border/40" style={{ left: s * pxPerSec }}>
              <span className="ml-1 font-mono text-[10px] tabular-nums text-muted-foreground">{tcLabel(s)}</span>
            </div>
          ))}
          {/* Playhead — near-white line + downward triangle handle */}
          <div
            className="pointer-events-none absolute top-0 z-20 h-full w-px bg-[var(--nle-playhead)] shadow-[0_0_2px_rgba(0,0,0,0.9)]"
            style={{ left: time * pxPerSec }}
          >
            <div
              className="absolute -top-px left-1/2 h-0 w-0 -translate-x-1/2 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent"
              style={{ borderTopColor: 'var(--nle-playhead)' }}
            />
          </div>
        </div>

        {/* Tracks */}
        <div className="relative">
          {/* Playhead line across tracks */}
          <div
            className="pointer-events-none absolute top-0 z-20 w-px bg-[var(--nle-playhead)] shadow-[0_0_2px_rgba(0,0,0,0.9)]"
            style={{ left: time * pxPerSec, height: project.tracks.length * TRACK_H }}
          />
          {project.tracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              sources={sources}
              pxPerSec={pxPerSec}
              selectedClipId={selectedClipId}
              snap={snap}
              snapTargets={snapTargets}
              onSelectClip={onSelectClip}
              onMoveClip={onMoveClip}
              onTrimClip={onTrimClip}
              onToggleMute={onToggleMute}
              muteLabel={t('media.timeline.muteTrack')}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function TrackRow({
  track,
  sources,
  pxPerSec,
  selectedClipId,
  snap,
  snapTargets,
  onSelectClip,
  onMoveClip,
  onTrimClip,
  onToggleMute,
  muteLabel,
}: {
  track: Track
  sources: Record<string, LoadedSource>
  pxPerSec: number
  selectedClipId: string | null
  snap: boolean
  snapTargets: number[]
  onSelectClip: (id: string | null) => void
  onMoveClip: (clipId: string, trackId: string, start: number) => void
  onTrimClip: (clipId: string, edge: 'in' | 'out', deltaSec: number) => void
  onToggleMute: (trackId: string) => void
  muteLabel: string
}) {
  return (
    <div
      className="relative border-b border-border/60"
      style={{ height: TRACK_H }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onSelectClip(null)
      }}
    >
      {/* Track label / mute */}
      <button
        type="button"
        onClick={() => onToggleMute(track.id)}
        title={muteLabel}
        className="absolute left-1 top-1 z-10 flex h-4 items-center gap-1 rounded-[2px] bg-black/55 px-1 font-mono text-[10px] text-white/70 hover:text-white"
      >
        {track.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
        {track.kind === 'video' ? 'V' : 'A'}
      </button>

      {track.clips.map((clip) => (
        <TimelineClipView
          key={clip.id}
          clip={clip}
          trackId={track.id}
          isVideo={track.kind === 'video'}
          name={sources[clip.sourceId]?.name ?? '?'}
          pxPerSec={pxPerSec}
          selected={clip.id === selectedClipId}
          snap={snap}
          snapTargets={snapTargets}
          onSelectClip={onSelectClip}
          onMoveClip={onMoveClip}
          onTrimClip={onTrimClip}
        />
      ))}
    </div>
  )
}

function TimelineClipView({
  clip,
  trackId,
  isVideo,
  name,
  pxPerSec,
  selected,
  snap,
  snapTargets,
  onSelectClip,
  onMoveClip,
  onTrimClip,
}: {
  clip: Clip
  trackId: string
  isVideo: boolean
  name: string
  pxPerSec: number
  selected: boolean
  snap: boolean
  snapTargets: number[]
  onSelectClip: (id: string | null) => void
  onMoveClip: (clipId: string, trackId: string, start: number) => void
  onTrimClip: (clipId: string, edge: 'in' | 'out', deltaSec: number) => void
}) {
  const [drag, setDrag] = useState<null | { mode: 'move' | 'in' | 'out'; startX: number; cands: number[] }>(null)
  const left = clip.timelineStart * pxPerSec
  const w = Math.max(8, clipDuration(clip) * pxPerSec)

  const onPointerDown = (mode: 'move' | 'in' | 'out') => (e: ReactPointerEvent) => {
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    onSelectClip(clip.id)
    // Capture snap candidates once, excluding this clip's own edges so it
    // doesn't stick to where it started.
    const cands =
      mode === 'move' && snap
        ? snapTargets.filter(
            (x) => Math.abs(x - clip.timelineStart) > 1e-4 && Math.abs(x - clipEnd(clip)) > 1e-4,
          )
        : []
    setDrag({ mode, startX: e.clientX, cands })
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag) return
    const dxSec = (e.clientX - drag.startX) / pxPerSec
    if (Math.abs(e.clientX - drag.startX) < 2) return
    if (drag.mode === 'move') {
      let ns = clip.timelineStart + dxSec
      if (drag.cands.length) ns = snapStart(ns, clipDuration(clip), drag.cands, SNAP_PX / pxPerSec)
      onMoveClip(clip.id, trackId, Math.max(0, ns))
    } else {
      onTrimClip(clip.id, drag.mode, dxSec)
    }
    setDrag({ ...drag, startX: e.clientX })
  }
  const onPointerUp = (e: ReactPointerEvent) => {
    if (drag) (e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    setDrag(null)
  }

  return (
    <div
      data-clip-id={clip.id}
      className={cn(
        'absolute top-[7px] flex h-[46px] items-stretch overflow-hidden rounded-[2px] text-[11px] select-none',
        isVideo
          ? 'bg-[var(--nle-clip-video)] shadow-[inset_0_1px_0_var(--nle-clip-video-top)]'
          : 'bg-[var(--nle-clip-audio)] shadow-[inset_0_1px_0_var(--nle-clip-audio-top)]',
        selected ? 'ring-2 ring-[var(--nle-selection)]' : 'ring-1 ring-black/30',
      )}
      style={{ left, width: w }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Left trim handle */}
      <div
        className="w-1.5 shrink-0 cursor-ew-resize bg-black/30 hover:bg-black/50"
        onPointerDown={onPointerDown('in')}
      />
      {/* Body (move). Label sits bottom-left so the floating track badge (top-
          left) never covers it, and the upper area stays free for a waveform. */}
      <div className="relative flex-1 cursor-grab" onPointerDown={onPointerDown('move')}>
        <span className="pointer-events-none absolute bottom-0.5 left-1 right-1 truncate text-white/95 [text-shadow:0_1px_1px_rgba(0,0,0,0.7)]">
          {name}
        </span>
      </div>
      {/* Right trim handle */}
      <div
        className="h-full w-1.5 shrink-0 cursor-ew-resize bg-black/30 hover:bg-black/50"
        onPointerDown={onPointerDown('out')}
      />
    </div>
  )
}
