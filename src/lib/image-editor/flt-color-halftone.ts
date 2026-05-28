import type { ColorHalftoneParams } from './types'
/**
 * Color Halftone — the classic CMYK halftone screen (Photoshop's Pixelate →
 * Color Halftone), producing the comic-book / newsprint dot look. Spatial
 * filter → shared FILTER signature, mutates `data` in place.
 *
 * HOW real halftone printing works (and why we mimic it): each process ink —
 * Cyan, Magenta, Yellow, Black — is printed through its own line screen, and
 * the four screens are deliberately set to DIFFERENT angles so their dot grids
 * don't overlap into ugly moiré. The traditional angles are roughly
 * C 15°, M 75°, Y 0°, K 45°. We replicate exactly that: convert RGB→CMYK, then
 * screen each channel independently on a grid rotated to its own angle, and
 * recombine CMYK→RGB.
 *
 * WHY per-channel angles matter: if every channel used the same grid, the dots
 * would stack perfectly and the picture would look like a single-color
 * pixelation, not the interleaved rosette of true CMYK halftone. The user's
 * `angle` param is an offset added to all four screen angles, letting them
 * rotate the whole rosette.
 *
 * WHY deterministic / preview == export: there's no randomness at all here.
 * Output is a pure function of the source pixels and the params, so the
 * low-res preview and full-res export agree for the same params.
 *
 * Algorithm — for each channel:
 *   1. Cell size = 2 * dotRadius. A screen cell that holds a max-density dot
 *      whose inscribed circle (radius dotRadius) just fits the cell. At full
 *      ink the inscribed circle covers ~78.5% (π/4) of the cell, leaving corner
 *      gaps — so even solid black areas keep tiny light gaps between dots,
 *      which is exactly the newsprint texture.
 *   2. Work in the channel's ROTATED screen space: rotate each pixel's
 *      coordinate by −angle, bucket it into a screen cell, and accumulate the
 *      channel's average ink for that cell (pass A). The local average ink
 *      density sets each dot's radius: radius = dotRadius * sqrt(density) (area
 *      ∝ ink, the physically correct dot-area mapping).
 *   3. Pass B: for each pixel, find its rotated-space cell, get the distance to
 *      that cell's center; inside the scaled dot radius ⇒ full ink (1), outside
 *      ⇒ no ink (0). Hard edges = crisp dots.
 *
 * Recombination uses naive CMYK (K extracted as the common min, C/M/Y reduced
 * by K) so pure white stays white (zero ink ⇒ no dots) and saturated/black
 * areas get dense dots — the two behaviours the tests check.
 */

export const DEFAULT_COLOR_HALFTONE: ColorHalftoneParams = {
  kind: 'colorHalftone',
  dotRadius: 4,
  angle: 45,
}

/** Traditional CMYK screen angles (degrees). The user `angle` is added to all. */
const CHANNEL_ANGLES = [15, 75, 0, 45] // C, M, Y, K

export function applyColorHalftone(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: ColorHalftoneParams,
): void {
  const dotRadius = Math.max(1, params.dotRadius)
  // Cell holds an inscribed max-density dot of radius `dotRadius`. See header:
  // π/4 coverage at full ink leaves corner gaps so solids aren't fully filled.
  const cellSize = Math.max(2, 2 * dotRadius)
  const pixelCount = width * height

  // --- RGB → CMYK (full black extraction). Stored as 0..1 per channel. ---
  // c[0]=C, c[1]=M, c[2]=Y, c[3]=K. Pure white (R=G=B=255) → all zeros → no ink.
  const cmyk: Float64Array[] = [
    new Float64Array(pixelCount),
    new Float64Array(pixelCount),
    new Float64Array(pixelCount),
    new Float64Array(pixelCount),
  ]
  for (let p = 0; p < pixelCount; p++) {
    const di = p * 4
    const r = data[di] / 255
    const g = data[di + 1] / 255
    const b = data[di + 2] / 255
    const k = 1 - Math.max(r, g, b)
    const denom = 1 - k
    let c = 0
    let m = 0
    let y = 0
    if (denom > 1e-6) {
      c = (1 - r - k) / denom
      m = (1 - g - k) / denom
      y = (1 - b - k) / denom
    }
    cmyk[0][p] = c
    cmyk[1][p] = m
    cmyk[2][p] = y
    cmyk[3][p] = k
  }

  // Center the rotation on the image so the screen is symmetric about the
  // middle rather than the origin corner.
  const cxImg = width / 2
  const cyImg = height / 2

  // The screened output ink per channel (0..1), one buffer reused per channel.
  const out = new Float64Array(pixelCount)

  for (let ch = 0; ch < 4; ch++) {
    const src = cmyk[ch]
    const angleDeg = CHANNEL_ANGLES[ch] + params.angle
    const a = (angleDeg * Math.PI) / 180
    const cosA = Math.cos(a)
    const sinA = Math.sin(a)

    // --- Pass A: bucket pixels into rotated-space screen cells, accumulate the
    // average ink density per cell. We track min/max rotated coords to size the
    // cell grid; offsetting by those mins keeps cell indices non-negative. ---
    // Rotate the four image corners to bound the rotated coordinate range.
    let minU = Infinity
    let maxU = -Infinity
    let minV = Infinity
    let maxV = -Infinity
    const corners = [
      [0 - cxImg, 0 - cyImg],
      [width - cxImg, 0 - cyImg],
      [0 - cxImg, height - cyImg],
      [width - cxImg, height - cyImg],
    ]
    for (const [dx, dy] of corners) {
      const u = dx * cosA - dy * sinA
      const v = dx * sinA + dy * cosA
      if (u < minU) minU = u
      if (u > maxU) maxU = u
      if (v < minV) minV = v
      if (v > maxV) maxV = v
    }
    const cellsU = Math.max(1, Math.ceil((maxU - minU) / cellSize) + 1)
    const cellsV = Math.max(1, Math.ceil((maxV - minV) / cellSize) + 1)

    const sum = new Float64Array(cellsU * cellsV)
    const cnt = new Float64Array(cellsU * cellsV)

    for (let p = 0; p < pixelCount; p++) {
      const x = p % width
      const y = (p / width) | 0
      const dx = x - cxImg
      const dy = y - cyImg
      const u = dx * cosA - dy * sinA
      const v = dx * sinA + dy * cosA
      const cu = Math.floor((u - minU) / cellSize)
      const cv = Math.floor((v - minV) / cellSize)
      const ci = cv * cellsU + cu
      sum[ci] += src[p]
      cnt[ci] += 1
    }

    // --- Pass B: for each pixel, distance to its cell center in rotated space;
    // inside the density-scaled dot radius ⇒ full ink, else none. ---
    for (let p = 0; p < pixelCount; p++) {
      const x = p % width
      const y = (p / width) | 0
      const dx = x - cxImg
      const dy = y - cyImg
      const u = dx * cosA - dy * sinA
      const v = dx * sinA + dy * cosA
      const cu = Math.floor((u - minU) / cellSize)
      const cv = Math.floor((v - minV) / cellSize)
      const ci = cv * cellsU + cu

      const density = cnt[ci] > 0 ? sum[ci] / cnt[ci] : 0
      // Dot AREA ∝ ink, so radius ∝ sqrt(density). Clamp to the inscribed max.
      const r = dotRadius * Math.sqrt(Math.max(0, Math.min(1, density)))

      // Cell center in rotated space → distance from this pixel.
      const centerU = minU + (cu + 0.5) * cellSize
      const centerV = minV + (cv + 0.5) * cellSize
      const du = u - centerU
      const dv = v - centerV
      const distSq = du * du + dv * dv

      // `r > 0` guard: at zero density the radius is 0, and a pixel sitting
      // exactly on the cell center would otherwise satisfy `0 <= 0` and light
      // up — painting ink into ink-free (e.g. pure white) areas. A zero-radius
      // dot must produce no ink at all.
      out[p] = r > 0 && distSq <= r * r ? 1 : 0
    }

    // Copy this channel's screened ink back into its CMYK buffer.
    src.set(out)
  }

  // --- CMYK → RGB recombine. With binary ink masks, dotted pixels get full
  // channel ink and gaps stay white-ish, giving the crisp newsprint look. ---
  for (let p = 0; p < pixelCount; p++) {
    const c = cmyk[0][p]
    const m = cmyk[1][p]
    const y = cmyk[2][p]
    const k = cmyk[3][p]
    const di = p * 4
    data[di] = 255 * (1 - c) * (1 - k)
    data[di + 1] = 255 * (1 - m) * (1 - k)
    data[di + 2] = 255 * (1 - y) * (1 - k)
    // Alpha is left untouched — halftone screens ink, not opacity.
  }
}
