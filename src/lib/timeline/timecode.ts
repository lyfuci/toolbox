/**
 * SMPTE-style timecode helpers for the Media editor, mirroring DaVinci Resolve's
 * HH:MM:SS:FF readout (frames, not milliseconds). Pure + unit-testable.
 *
 * We treat fps as a non-drop-frame integer count (our projects default to 30).
 * Frames are derived from the total-frame count so rounding carries cleanly
 * across the second boundary (e.g. 1.9999s @30 → 00:00:01:29, never :30).
 */

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))

/** Format seconds as HH:MM:SS:FF at the given fps. Negative clamps to zero. */
export function formatTC(seconds: number, fps: number): string {
  const F = Math.max(1, Math.round(fps || 30))
  const totalFrames = Math.max(0, Math.round((seconds || 0) * F))
  const f = totalFrames % F
  const totalSeconds = Math.floor(totalFrames / F)
  const s = totalSeconds % 60
  const m = Math.floor(totalSeconds / 60) % 60
  const h = Math.floor(totalSeconds / 3600)
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}:${pad2(f)}`
}

/** One frame's duration in seconds at the given fps. */
export function frameDuration(fps: number): number {
  return 1 / Math.max(1, Math.round(fps || 30))
}
