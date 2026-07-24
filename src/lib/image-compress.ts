/**
 * Pure helpers for the image-compression tool, split from the page so the
 * format/dimension/target-size logic stays unit-testable without a browser
 * canvas. The actual pixel work (decode → draw → `canvas.toBlob`) lives in the
 * page; these functions decide *what* to encode.
 */

export type OutFormat = 'original' | 'jpeg' | 'webp' | 'png'

export const LOSSY_MIME: Record<'jpeg' | 'webp' | 'png', string> = {
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  png: 'image/png',
}
export const OUT_EXT: Record<'jpeg' | 'webp' | 'png', string> = {
  jpeg: 'jpg',
  webp: 'webp',
  png: 'png',
}

export type ResolvedOutput = { mime: string; ext: string; lossy: boolean }

/**
 * Decide the output mime/ext given the source mime and the chosen format.
 * `original` keeps a re-encodable source format (jpeg/webp/png); anything the
 * canvas can't re-emit as-is (gif/bmp/svg/…) falls back to lossless PNG.
 * `lossy` is true for jpeg/webp (a quality applies), false for png.
 */
export function resolveOutput(sourceMime: string, out: OutFormat): ResolvedOutput {
  if (out === 'original') {
    if (sourceMime === 'image/jpeg' || sourceMime === 'image/jpg') return { mime: 'image/jpeg', ext: 'jpg', lossy: true }
    if (sourceMime === 'image/webp') return { mime: 'image/webp', ext: 'webp', lossy: true }
    return { mime: 'image/png', ext: 'png', lossy: false }
  }
  return { mime: LOSSY_MIME[out], ext: OUT_EXT[out], lossy: out !== 'png' }
}

// Browsers cap canvas pixels; stay comfortably under the per-side limit.
const HARD_MAX_EDGE = 16384

/**
 * Fit an image within `maxEdge` on its longest side (keeping aspect ratio, never
 * upscaling), and hard-cap at the canvas limit. Returns integer dimensions ≥ 1.
 */
export function fitDimensions(w: number, h: number, maxEdge?: number | null): { width: number; height: number } {
  const longest = Math.max(w, h)
  let scale = 1
  if (maxEdge && maxEdge > 0 && longest > maxEdge) scale = maxEdge / longest
  if (longest * scale > HARD_MAX_EDGE) scale = HARD_MAX_EDGE / longest
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

/**
 * Binary-search the highest integer quality in [minQ,maxQ] whose encoded size is
 * ≤ `targetBytes`. `sizeAt(q)` returns the byte size at quality q. If even the
 * lowest quality overshoots, returns `minQ` (the smallest we'll go). Pure —
 * `sizeAt` is injected, so it tests with a mock and runs with `canvas.toBlob`.
 */
export async function searchQualityForSize(
  sizeAt: (q: number) => Promise<number>,
  targetBytes: number,
  minQ = 30,
  maxQ = 95,
  iterations = 7,
): Promise<number> {
  let lo = minQ
  let hi = maxQ
  let best = minQ
  for (let i = 0; i < iterations && lo <= hi; i++) {
    const mid = Math.floor((lo + hi) / 2)
    const size = await sizeAt(mid)
    if (size <= targetBytes) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

/** Human-readable byte size. */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

/** Signed percent change from `before` to `after` (negative = smaller). */
export function pctChange(before: number, after: number): number {
  if (before <= 0) return 0
  return Math.round(((after - before) / before) * 100)
}
