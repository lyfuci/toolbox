import { useEffect, useReducer, useRef } from 'react'
import { getWaveform, subscribeWaveform, peakColumnRange } from '@/lib/timeline/waveform'

/**
 * Draws a mirrored audio-waveform envelope across an audio clip. Shows a cheap
 * procedural envelope immediately, then repaints when real PCM peaks decode.
 * Sits behind the clip's handles/label (the parent isolates the stacking).
 */
export function WaveformClip({
  sourceId,
  file,
  sourceIn,
  sourceOut,
  srcDuration,
  width,
  height,
}: {
  sourceId: string
  file?: File
  sourceIn: number
  sourceOut: number
  srcDuration: number
  width: number
  height: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [, force] = useReducer((x: number) => x + 1, 0)

  // Re-render when real peaks arrive for this source.
  useEffect(() => subscribeWaveform(sourceId, force), [sourceId])

  const { peaks } = getWaveform(sourceId, file)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.floor(width * dpr))
    const h = Math.max(1, Math.floor(height * dpr))
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(150, 232, 178, 0.55)'
    const { start, end } = peakColumnRange(sourceIn, sourceOut, srcDuration, peaks.length)
    const span = end - start
    const mid = h / 2
    for (let x = 0; x < w; x++) {
      const col = start + Math.floor((x / w) * span)
      const p = peaks[Math.min(peaks.length - 1, Math.max(0, col))] ?? 0
      const bar = p * mid
      ctx.fillRect(x, mid - bar, 1, bar * 2)
    }
  }, [peaks, width, height, sourceIn, sourceOut, srcDuration])

  return (
    <canvas
      ref={ref}
      style={{ width, height }}
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
    />
  )
}
