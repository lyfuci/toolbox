import { useCallback, useEffect, useRef, useState } from 'react'
import { type Project, clipAt, timelineToSource, projectDuration } from '@/lib/timeline/model'
import type { LoadedSource } from './useTimeline'

/**
 * Preview engine — native browser playback, NOT ffmpeg. For the current
 * playhead time it picks the active video clip per video track, seeks a hidden
 * <video> for that source to the mapped source time and paints it to a canvas;
 * audio plays through hidden <audio>/<video> elements positioned at the right
 * source time. This is what makes scrub/play realtime (ffmpeg.wasm cannot).
 *
 * Media elements are created lazily per source and cached. The caller renders
 * the returned `mediaRefs` as hidden elements and the canvas.
 */
export function useTimelinePlayer(project: Project, sources: Record<string, LoadedSource>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const mediaEls = useRef<Map<string, HTMLVideoElement | HTMLAudioElement>>(new Map())
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const rafRef = useRef<number | null>(null)
  const startWallRef = useRef(0)
  const startTimeRef = useRef(0)
  const duration = projectDuration(project)

  // Mirror the latest playing/time into refs so async video frame callbacks
  // (which fire after a seek resolves) can repaint against current values
  // without being torn down/recreated. `renderAtRef` breaks the chicken-and-egg
  // of a repaint callback that needs to call the very function defining it.
  const playingRef = useRef(playing)
  const timeRef = useRef(time)
  const renderAtRef = useRef<(t: number, isPlaying: boolean) => void>(() => {})
  useEffect(() => {
    playingRef.current = playing
  }, [playing])
  useEffect(() => {
    timeRef.current = time
  }, [time])

  const getEl = useCallback(
    (sourceId: string): HTMLVideoElement | HTMLAudioElement | null => {
      const existing = mediaEls.current.get(sourceId)
      if (existing) return existing
      const src = sources[sourceId]
      if (!src) return null
      const el: HTMLVideoElement | HTMLAudioElement = src.hasVideo
        ? document.createElement('video')
        : document.createElement('audio')
      el.src = src.url
      el.preload = 'auto'
      ;(el as HTMLVideoElement).muted = false
      mediaEls.current.set(sourceId, el)
      return el
    },
    [sources],
  )

  // Setting video.currentTime is ASYNC — the decoded frame isn't ready in the
  // same tick, so a paused single-frame step would otherwise paint the previous
  // frame (and disagree with the timecode readout). Schedule ONE repaint once
  // the frame actually lands, keyed to the latest time (not a captured one) so
  // rapid steps converge instead of bouncing back. Deduped per element.
  const scheduleRepaint = useCallback((v: HTMLVideoElement) => {
    type VEl = HTMLVideoElement & {
      __repaintPending?: boolean
      requestVideoFrameCallback?: (cb: () => void) => number
    }
    const vv = v as VEl
    if (vv.__repaintPending) return
    vv.__repaintPending = true
    const run = () => {
      vv.__repaintPending = false
      if (!playingRef.current) renderAtRef.current(timeRef.current, false)
    }
    if (typeof vv.requestVideoFrameCallback === 'function') vv.requestVideoFrameCallback(run)
    else v.addEventListener('seeked', run, { once: true })
  }, [])

  // Paint the active video frame for time t and sync audio elements.
  const renderAt = useCallback(
    (t: number, isPlaying: boolean) => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }

      // Track which source elements should be audibly playing this frame.
      const activeAudio = new Set<string>()

      for (const track of project.tracks) {
        const clip = clipAt(track, t)
        if (!clip) continue
        const src = sources[clip.sourceId]
        if (!src) continue
        const el = getEl(clip.sourceId)
        if (!el) continue
        const srcTime = timelineToSource(clip, t)

        if (track.kind === 'video' && src.hasVideo && canvas && ctx) {
          const v = el as HTMLVideoElement
          if (!isPlaying && Math.abs(v.currentTime - srcTime) > 0.05) {
            v.currentTime = srcTime
            scheduleRepaint(v)
          }
          // Letterbox-fit draw.
          const vw = v.videoWidth || src.width || canvas.width
          const vh = v.videoHeight || src.height || canvas.height
          if (vw && vh) {
            const scale = Math.min(canvas.width / vw, canvas.height / vh)
            const dw = vw * scale
            const dh = vh * scale
            try {
              ctx.drawImage(v, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh)
            } catch {
              /* not yet decodable */
            }
          }
        }

        // Audio (from audio clips, and video clips that carry audio).
        if (src.hasAudio && !track.muted) {
          activeAudio.add(clip.sourceId)
          el.volume = Math.max(0, Math.min(1, clip.volume ?? 1))
          if (isPlaying) {
            if (Math.abs(el.currentTime - srcTime) > 0.25) el.currentTime = srcTime
            if (el.paused) el.play().catch(() => {})
          }
        }
      }

      // Pause any element that shouldn't sound now.
      for (const [sid, el] of mediaEls.current) {
        if (!activeAudio.has(sid) && !el.paused) el.pause()
        // Keep a paused video seeked for scrubbing handled above.
        void sid
      }
    },
    [project, sources, getEl, scheduleRepaint],
  )

  // Keep the ref pointing at the latest renderAt for async repaint callbacks.
  useEffect(() => {
    renderAtRef.current = renderAt
  }, [renderAt])

  const stopRaf = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
  }

  const pause = useCallback(() => {
    setPlaying(false)
    stopRaf()
    for (const el of mediaEls.current.values()) el.pause()
  }, [])

  const seek = useCallback(
    (t: number) => {
      const clamped = Math.max(0, Math.min(duration, t))
      setTime(clamped)
      if (!playing) renderAt(clamped, false)
    },
    [duration, playing, renderAt],
  )

  const play = useCallback(() => {
    if (duration <= 0) return
    setPlaying(true)
    startWallRef.current = performance.now()
    startTimeRef.current = time >= duration ? 0 : time
    if (time >= duration) setTime(0)

    const tick = () => {
      const elapsed = (performance.now() - startWallRef.current) / 1000
      const t = startTimeRef.current + elapsed
      if (t >= duration) {
        setTime(duration)
        renderAt(duration, false)
        setPlaying(false)
        for (const el of mediaEls.current.values()) el.pause()
        stopRaf()
        return
      }
      setTime(t)
      renderAt(t, true)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [duration, time, renderAt])

  // Repaint a still frame when paused and the project/time changes.
  useEffect(() => {
    if (!playing) renderAt(time, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, time])

  // Cleanup on unmount.
  useEffect(() => {
    const els = mediaEls.current
    return () => {
      stopRaf()
      for (const el of els.values()) {
        el.pause()
        el.src = ''
      }
      els.clear()
    }
  }, [])

  return { canvasRef, playing, time, duration, play, pause, seek }
}
