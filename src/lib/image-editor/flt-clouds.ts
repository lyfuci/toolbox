/**
 * Clouds — render a fractal "value noise" cloud field and blend two colors by
 * it, replacing the entire buffer (like Photoshop's Filter → Render → Clouds,
 * which ignores existing pixels). Spatial filter → shared FILTER signature,
 * mutates `data` in place.
 *
 * WHY fully deterministic: the editor re-renders the preview and the export
 * from the same FilterParams. If we used `Math.random()` the cloud pattern
 * would reshuffle on every redraw and the export wouldn't match the preview.
 * Instead a small seeded PRNG (mulberry32) derives every lattice value from
 * `seed`, so identical `seed` ⇒ byte-identical output, every time.
 *
 * WHY resolution-independent: noise is sampled in *normalized* coordinates
 * (0..1 across the image, multiplied by `scale` to get the base lattice
 * frequency). The visual feature size therefore tracks the image rather than
 * the pixel grid, so the preview buffer and the full-res export buffer look
 * the same and `scale` needs NO bake-scale (`scaleFilterParams`) scaling.
 *
 * Algorithm — fractal value noise:
 *   • A lattice of pseudo-random values keyed by integer (gx, gy) cell coords.
 *   • Bilinear interpolation with a smoothstep fade gives a smooth 2D field.
 *   • Several OCTAVES are summed: each octave doubles the frequency and halves
 *     the amplitude (persistence 0.5), the classic fBm recipe. This is what
 *     gives clouds their soft-large + crisp-small detail.
 *   • The summed value is normalized to 0..1 and used to lerp bg → fg.
 */

export type CloudsParams = {
  kind: 'clouds'
  /** Integer seed; identical seeds produce identical clouds. */
  seed: number
  /** ~1..10. Base feature size: number of lattice cells across the image's min side. */
  scale: number
  /** Foreground hex color, mapped to noise = 1. */
  fg: string
  /** Background hex color, mapped to noise = 0. */
  bg: string
}

export const DEFAULT_CLOUDS: CloudsParams = {
  kind: 'clouds',
  seed: 1,
  scale: 4,
  fg: '#000000',
  bg: '#ffffff',
}

/**
 * Mulberry32 — tiny seeded PRNG, floats in [0, 1). Inlined here (rather than
 * imported) so this filter file is self-contained. Good-enough distribution
 * for noise; not cryptographic.
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Parse #rgb / #rrggbb hex into [r,g,b] bytes. Falls back to black on garbage. */
function parseHex(hex: string): [number, number, number] {
  let s = hex.trim().replace('#', '')
  if (s.length === 3)
    s = s
      .split('')
      .map((c) => c + c)
      .join('')
  if (s.length !== 6) return [0, 0, 0]
  const n = parseInt(s, 16)
  if (Number.isNaN(n)) return [0, 0, 0]
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

/** Hermite fade used to smooth the bilinear lattice interpolation. */
function fade(t: number): number {
  return t * t * (3 - 2 * t)
}

/**
 * Deterministic value at integer lattice cell (gx, gy). We mix the coords with
 * the seed via mulberry32 so a single seed defines an entire, stable lattice.
 * The hash itself is independent of image size, which is what keeps the field
 * resolution-independent.
 */
function latticeValue(gx: number, gy: number, seed: number): number {
  // Combine into a single 32-bit key, then run one PRNG step from it.
  const key = (Math.imul(gx, 374761393) + Math.imul(gy, 668265263) + seed) | 0
  return mulberry32(key >>> 0)()
}

/** Smoothed 2D value noise sampled at continuous (x, y) lattice coordinates. */
function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = fade(x - x0)
  const fy = fade(y - y0)

  const v00 = latticeValue(x0, y0, seed)
  const v10 = latticeValue(x0 + 1, y0, seed)
  const v01 = latticeValue(x0, y0 + 1, seed)
  const v11 = latticeValue(x0 + 1, y0 + 1, seed)

  const top = v00 + (v10 - v00) * fx
  const bottom = v01 + (v11 - v01) * fx
  return top + (bottom - top) * fy
}

/**
 * Fill the whole buffer with fractal clouds (opaque RGB; alpha forced to 255).
 *
 * For each pixel we map its position to normalized 0..1 coords, multiply by
 * `scale` for the base lattice frequency, sum `OCTAVES` octaves of value noise
 * (frequency ×2, amplitude ×0.5 each), normalize to 0..1, and lerp the bg→fg
 * colors by that value.
 */
export function applyClouds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: CloudsParams,
): void {
  const [fr, fg, fb] = parseHex(params.fg)
  const [br, bg, bb] = parseHex(params.bg)
  const seed = params.seed | 0
  const baseFreq = Math.max(0.5, params.scale)

  const OCTAVES = 5
  const PERSISTENCE = 0.5
  // Max possible amplitude sum, to normalize the fBm result back into 0..1.
  let maxAmp = 0
  for (let o = 0; o < OCTAVES; o++) maxAmp += Math.pow(PERSISTENCE, o)

  // Use the smaller dimension as the normalization base so cells stay roughly
  // square regardless of aspect ratio.
  const minDim = Math.max(1, Math.min(width, height))

  for (let y = 0; y < height; y++) {
    const ny = y / minDim
    for (let x = 0; x < width; x++) {
      const nx = x / minDim

      let amp = 1
      let freq = baseFreq
      let sum = 0
      for (let o = 0; o < OCTAVES; o++) {
        // Offset each octave's seed so octaves are decorrelated.
        sum += valueNoise(nx * freq, ny * freq, seed + o * 1013) * amp
        amp *= PERSISTENCE
        freq *= 2
      }
      const t = sum / maxAmp // 0..1

      const i = (y * width + x) * 4
      data[i] = br + (fr - br) * t
      data[i + 1] = bg + (fg - bg) * t
      data[i + 2] = bb + (fb - bb) * t
      data[i + 3] = 255
    }
  }
}
