/**
 * Audio-waveform peaks for timeline clips, procedural-first.
 *
 * A cheap deterministic envelope (seeded by sourceId) renders instantly so audio
 * clips never look bare, then real PCM peaks decoded off the source File replace
 * it as a progressive enhancement. Export uses ffmpeg (not WebAudio), so this
 * decode is net-new work — it's cached per source and size-gated to avoid
 * decoding huge files into memory.
 */

export const WAVE_COLS = 1600
const MAX_DECODE_BYTES = 100 * 1024 * 1024 // skip real decode above ~100 MB

type Entry = { peaks: Float32Array; real: boolean }

const cache = new Map<string, Entry>()
const subs = new Map<string, Set<() => void>>()
const decoding = new Set<string>()

/** Deterministic pseudo-audio envelope in [0,1], stable per sourceId. Pure. */
export function proceduralPeaks(sourceId: string, cols = WAVE_COLS): Float32Array {
  let seed = 0
  for (let i = 0; i < sourceId.length; i++) seed = (seed * 31 + sourceId.charCodeAt(i)) >>> 0
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0xffffffff
  }
  const phase = (seed % 100) / 10
  const peaks = new Float32Array(cols)
  for (let i = 0; i < cols; i++) {
    const t = i / cols
    const env = 0.3 + 0.4 * Math.abs(Math.sin(t * Math.PI * 7 + phase))
    peaks[i] = Math.min(1, env * (0.55 + 0.7 * rand()))
  }
  return peaks
}

/** Map a source time window to the [start,end) peak-column indices. Pure. */
export function peakColumnRange(sourceIn: number, sourceOut: number, srcDuration: number, cols = WAVE_COLS) {
  const d = srcDuration > 0 ? srcDuration : 1
  const start = Math.max(0, Math.min(cols - 1, Math.floor((sourceIn / d) * cols)))
  const end = Math.max(start + 1, Math.min(cols, Math.ceil((sourceOut / d) * cols)))
  return { start, end }
}

async function decodePeaks(file: File, cols: number): Promise<Float32Array> {
  const AC: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new AC()
  try {
    const audio = await ctx.decodeAudioData(await file.arrayBuffer())
    const ch = audio.getChannelData(0)
    const block = Math.max(1, Math.floor(ch.length / cols))
    const peaks = new Float32Array(cols)
    let pk = 0
    for (let i = 0; i < cols; i++) {
      let max = 0
      const s = i * block
      const e = Math.min(ch.length, s + block)
      for (let j = s; j < e; j++) {
        const v = Math.abs(ch[j])
        if (v > max) max = v
      }
      peaks[i] = max
      if (max > pk) pk = max
    }
    if (pk > 0) for (let i = 0; i < cols; i++) peaks[i] /= pk
    return peaks
  } finally {
    void ctx.close?.()
  }
}

function notify(sourceId: string) {
  subs.get(sourceId)?.forEach((fn) => fn())
}

/**
 * Current peaks for a source (procedural until real PCM lands). Kicks off a
 * one-time real decode; subscribers are notified when it completes. Never throws
 * — on decode failure the procedural envelope stays.
 */
export function getWaveform(sourceId: string, file?: File): Entry {
  let entry = cache.get(sourceId)
  if (!entry) {
    entry = { peaks: proceduralPeaks(sourceId), real: false }
    cache.set(sourceId, entry)
  }
  if (!entry.real && file && file.size <= MAX_DECODE_BYTES && !decoding.has(sourceId)) {
    decoding.add(sourceId)
    decodePeaks(file, WAVE_COLS)
      .then((peaks) => {
        cache.set(sourceId, { peaks, real: true })
        decoding.delete(sourceId)
        notify(sourceId)
      })
      .catch(() => {
        decoding.delete(sourceId) // keep the procedural envelope
      })
  }
  return cache.get(sourceId)!
}

export function subscribeWaveform(sourceId: string, fn: () => void): () => void {
  let set = subs.get(sourceId)
  if (!set) {
    set = new Set()
    subs.set(sourceId, set)
  }
  set.add(fn)
  return () => set!.delete(fn)
}
