import { useRef } from 'react'
import { type Project, clipDuration } from '@/lib/timeline/model'

/**
 * Whole-project overview strip (DaVinci Cut-page style): clips compressed to
 * fit, a playhead marker, click/drag to seek. Complements the zoomable main
 * timeline for navigating long edits at a glance.
 */
export function Minimap({
  project,
  total,
  time,
  onSeek,
}: {
  project: Project
  total: number
  time: number
  onSeek: (t: number) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const seekAt = (clientX: number) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    onSeek(Math.max(0, Math.min(total, ((clientX - rect.left) / rect.width) * total)))
  }
  const dur = total > 0 ? total : 1
  return (
    <div
      ref={ref}
      className="relative h-6 w-full cursor-pointer overflow-hidden rounded border border-border bg-[var(--nle-timeline)]"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        seekAt(e.clientX)
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) seekAt(e.clientX)
      }}
    >
      {project.tracks.map((tr, ti) =>
        tr.clips.map((c) => (
          <div
            key={c.id}
            className="absolute rounded-[1px]"
            style={{
              left: `${(c.timelineStart / dur) * 100}%`,
              width: `${Math.max(0.4, (clipDuration(c) / dur) * 100)}%`,
              top: ti % 2 ? '52%' : '12%',
              height: '36%',
              backgroundColor: tr.kind === 'video' ? 'var(--nle-clip-video)' : 'var(--nle-clip-audio)',
            }}
          />
        )),
      )}
      <div
        className="pointer-events-none absolute top-0 h-full w-px bg-[var(--nle-playhead)]"
        style={{ left: `${(time / dur) * 100}%` }}
      />
    </div>
  )
}
