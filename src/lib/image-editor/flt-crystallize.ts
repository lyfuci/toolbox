import type { CrystallizeParams } from './types'
/**
 * Crystallize — Voronoi pixelation (Photoshop's Pixelate → Crystallize). The
 * image is shattered into irregular polygonal "crystal" regions, each filled
 * with the average color of the source pixels it covers. Spatial filter →
 * shared FILTER signature, mutates `data` in place.
 *
 * WHY a jittered grid of seeds (not pure random scatter): we need every
 * Voronoi seed to be derivable from its grid cell coordinates so the pattern
 * is fully deterministic and locally bounded. Deterministic means the preview
 * and the export — both rendered from the same params — are byte-identical
 * (no `Math.random()` reshuffle). Locally bounded means each pixel's nearest
 * seed is guaranteed to live in its own grid cell or one of the 8 neighbours,
 * so we never have to brute-force every seed in the image: nearest-seed lookup
 * is O(9) per pixel regardless of image size.
 *
 * WHY a seeded PRNG keyed only on (cellX, cellY): the jitter offset of each
 * seed depends purely on its integer cell coordinates (mixed with mulberry32,
 * same hashing recipe as flt-clouds.ts). Identical params ⇒ identical seed
 * positions ⇒ identical cells, every run. No global RNG state, no ordering
 * dependence.
 *
 * Algorithm (two passes over the pixels, plus a cheap seed precompute):
 *   0. Lay a grid of ~`cellSize`-spaced cells across the image. Each cell gets
 *      one seed point, placed at cell origin + a deterministic jitter inside
 *      the cell. Seed positions are precomputed into flat arrays.
 *   1. Accumulate pass: for each pixel, find the nearest seed by scanning the
 *      3×3 block of grid cells around the pixel's own cell, record that seed
 *      index per pixel, and add the pixel's r/g/b/a into that seed's running
 *      sums (with a count).
 *   2. Write pass: for each pixel, look up its seed index and write that seed's
 *      mean color (sum / count). Alpha is averaged identically so partially
 *      transparent regions stay consistent.
 *
 * The result is crisp polygon edges (each pixel snaps wholly to one seed) with
 * a flat average fill per region — the signature Crystallize look.
 */

export const DEFAULT_CRYSTALLIZE: CrystallizeParams = {
  kind: 'crystallize',
  cellSize: 20,
}

/**
 * Mulberry32 — tiny seeded PRNG returning a float in [0, 1). Inlined so this
 * filter file is self-contained. Used here only to derive a stable jitter
 * offset from a 32-bit key; not cryptographic.
 */
function mulberry32(seed: number): number {
  let s = seed >>> 0
  s = (s + 0x6d2b79f5) >>> 0
  let t = s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * Deterministic [0,1) jitter for a given lattice cell and axis. We fold the
 * cell coords + an axis salt into one 32-bit key (same Math.imul mixing as
 * flt-clouds' latticeValue) so X and Y jitter are decorrelated yet stable.
 */
function cellJitter(cx: number, cy: number, salt: number): number {
  const key =
    (Math.imul(cx, 374761393) + Math.imul(cy, 668265263) + Math.imul(salt, 1013)) | 0
  return mulberry32(key >>> 0)
}

export function applyCrystallize(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: CrystallizeParams,
): void {
  // Clamp cell size to a sane minimum so we never divide by zero or build an
  // absurd number of cells; 1px cells degenerate to an identity-ish pass.
  const cell = Math.max(1, Math.round(params.cellSize))

  // Grid dimensions. `max(1, …)` guarantees at least one cell on each axis even
  // when cellSize >= the image dimension — that single-cell case collapses the
  // whole image to one Voronoi region (≈ one averaged color), as expected.
  const cols = Math.max(1, Math.ceil(width / cell))
  const rows = Math.max(1, Math.ceil(height / cell))
  const seedCount = cols * rows

  // Precompute every seed's pixel position. Seed for cell (gx, gy) sits at the
  // cell origin plus a deterministic in-cell jitter, clamped to image bounds so
  // a seed never lands outside the canvas.
  const seedX = new Float64Array(seedCount)
  const seedY = new Float64Array(seedCount)
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const idx = gy * cols + gx
      const jx = cellJitter(gx, gy, 1)
      const jy = cellJitter(gx, gy, 2)
      let px = (gx + jx) * cell
      let py = (gy + jy) * cell
      if (px > width - 1) px = width - 1
      if (py > height - 1) py = height - 1
      seedX[idx] = px
      seedY[idx] = py
    }
  }

  // Per-seed colour accumulators and the per-pixel seed assignment.
  const sumR = new Float64Array(seedCount)
  const sumG = new Float64Array(seedCount)
  const sumB = new Float64Array(seedCount)
  const sumA = new Float64Array(seedCount)
  const count = new Float64Array(seedCount)
  const assign = new Int32Array(width * height)

  // Pass 1 — assign each pixel to its nearest seed (3×3 cell neighbourhood)
  // and accumulate that seed's colour sums.
  for (let y = 0; y < height; y++) {
    const py = y / cell
    const baseGy = Math.floor(py)
    for (let x = 0; x < width; x++) {
      const px = x / cell
      const baseGx = Math.floor(px)

      let bestSeed = -1
      let bestDist = Infinity
      // Scan the pixel's own grid cell plus the 8 neighbours. Out-of-range
      // cells are skipped (no wrap-around), which correctly handles edges.
      for (let dy = -1; dy <= 1; dy++) {
        const gy = baseGy + dy
        if (gy < 0 || gy >= rows) continue
        for (let dx = -1; dx <= 1; dx++) {
          const gx = baseGx + dx
          if (gx < 0 || gx >= cols) continue
          const sIdx = gy * cols + gx
          const ddx = x - seedX[sIdx]
          const ddy = y - seedY[sIdx]
          const dist = ddx * ddx + ddy * ddy
          if (dist < bestDist) {
            bestDist = dist
            bestSeed = sIdx
          }
        }
      }

      const pi = y * width + x
      assign[pi] = bestSeed
      const di = pi * 4
      sumR[bestSeed] += data[di]
      sumG[bestSeed] += data[di + 1]
      sumB[bestSeed] += data[di + 2]
      sumA[bestSeed] += data[di + 3]
      count[bestSeed] += 1
    }
  }

  // Precompute each seed's mean colour once (avoids redividing per pixel).
  const meanR = new Float64Array(seedCount)
  const meanG = new Float64Array(seedCount)
  const meanB = new Float64Array(seedCount)
  const meanA = new Float64Array(seedCount)
  for (let s = 0; s < seedCount; s++) {
    const c = count[s]
    if (c > 0) {
      meanR[s] = sumR[s] / c
      meanG[s] = sumG[s] / c
      meanB[s] = sumB[s] / c
      meanA[s] = sumA[s] / c
    }
  }

  // Pass 2 — paint each pixel with its seed's mean colour.
  for (let pi = 0; pi < assign.length; pi++) {
    const s = assign[pi]
    const di = pi * 4
    data[di] = meanR[s]
    data[di + 1] = meanG[s]
    data[di + 2] = meanB[s]
    data[di + 3] = meanA[s]
  }
}
