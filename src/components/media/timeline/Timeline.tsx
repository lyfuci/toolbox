import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Volume2, VolumeX } from 'lucide-react'
import { type Project, type Clip, type Track, clipDuration } from '@/lib/timeline/model'
import type { LoadedSource } from './useTimeline'
import { cn } from '@/lib/utils'

const TRACK_H = 56
const RULER_H = 24

type Props = {
  project: Project
  sources: Record<string, LoadedSource>
  pxPerSec: number
  time: number
  selectedClipId: string | null
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
    <div className="overflow-x-auto rounded-lg border border-border bg-card/30" ref={scrollRef}>
      <div style={{ width, minWidth: '100%' }}>
        {/* Ruler */}
        <div
          className="relative cursor-pointer border-b border-border bg-card/50"
          style={{ height: RULER_H }}
          onPointerDown={(e) => seekFromEvent(e.clientX)}
        >
          {ticks.map((s) => (
            <div key={s} className="absolute top-0 h-full border-l border-border/50" style={{ left: s * pxPerSec }}>
              <span className="ml-1 text-[10px] text-muted-foreground">{s}s</span>
            </div>
          ))}
          {/* Playhead */}
          <div className="pointer-events-none absolute top-0 z-20 h-full w-px bg-primary" style={{ left: time * pxPerSec }}>
            <div className="absolute -left-1 -top-0.5 h-2 w-2 rounded-full bg-primary" />
          </div>
        </div>

        {/* Tracks */}
        <div className="relative">
          {/* Playhead line across tracks */}
          <div
            className="pointer-events-none absolute top-0 z-20 w-px bg-primary/70"
            style={{ left: time * pxPerSec, height: project.tracks.length * TRACK_H }}
          />
          {project.tracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              sources={sources}
              pxPerSec={pxPerSec}
              selectedClipId={selectedClipId}
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
        className="absolute left-1 top-1 z-10 flex h-5 items-center gap-1 rounded bg-background/70 px-1 text-[10px] text-muted-foreground hover:text-foreground"
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
  onSelectClip: (id: string | null) => void
  onMoveClip: (clipId: string, trackId: string, start: number) => void
  onTrimClip: (clipId: string, edge: 'in' | 'out', deltaSec: number) => void
}) {
  const [drag, setDrag] = useState<null | { mode: 'move' | 'in' | 'out'; startX: number }>(null)
  const left = clip.timelineStart * pxPerSec
  const w = Math.max(8, clipDuration(clip) * pxPerSec)

  const onPointerDown = (mode: 'move' | 'in' | 'out') => (e: ReactPointerEvent) => {
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    onSelectClip(clip.id)
    setDrag({ mode, startX: e.clientX })
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag) return
    const dxSec = (e.clientX - drag.startX) / pxPerSec
    if (Math.abs(e.clientX - drag.startX) < 2) return
    if (drag.mode === 'move') {
      onMoveClip(clip.id, trackId, Math.max(0, clip.timelineStart + dxSec))
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
      className={cn(
        'absolute top-7 flex h-[26px] items-center overflow-hidden rounded text-[11px] select-none',
        isVideo ? 'bg-sky-600/70' : 'bg-emerald-600/70',
        selected ? 'ring-2 ring-primary' : 'ring-1 ring-black/20',
      )}
      style={{ left, width: w }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Left trim handle */}
      <div
        className="h-full w-1.5 shrink-0 cursor-ew-resize bg-black/30 hover:bg-black/50"
        onPointerDown={onPointerDown('in')}
      />
      {/* Body (move) */}
      <div className="flex-1 cursor-grab truncate px-1 text-white/90" onPointerDown={onPointerDown('move')}>
        {name}
      </div>
      {/* Right trim handle */}
      <div
        className="h-full w-1.5 shrink-0 cursor-ew-resize bg-black/30 hover:bg-black/50"
        onPointerDown={onPointerDown('out')}
      />
    </div>
  )
}
