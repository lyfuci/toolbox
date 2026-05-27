import type { EqualizeParams } from './types'
/**
 * Equalize (PS Image > Adjustments > Equalize) — redistributes pixel
 * luminance so the brightness histogram is as flat as possible, stretching
 * contrast across the full 0–255 range. One-click, no parameters.
 *
 * Implementation: build a 256-bin luminance histogram, integrate it into a
 * CDF, and turn the CDF into a 0–255 remap LUT. We then scale each pixel's RGB
 * by the ratio between its remapped and original luminance so hue is preserved
 * (equalizing channels independently would shift colors). Per-pixel + two
 * histogram passes, so it stays in the `applyAdjustment(data, params)` shape.
 */

export const DEFAULT_EQUALIZE: EqualizeParams = { kind: 'equalize' }

const lum = (r: number, g: number, b: number): number =>
  0.299 * r + 0.587 * g + 0.114 * b

export function applyEqualize(data: Uint8ClampedArray): void {
  const n = data.length
  if (n === 0) return

  // 1. Luminance histogram (only count pixels with alpha > 0).
  const hist = new Float64Array(256)
  let count = 0
  for (let i = 0; i < n; i += 4) {
    if (data[i + 3] === 0) continue
    hist[Math.round(lum(data[i], data[i + 1], data[i + 2]))]++
    count++
  }
  if (count === 0) return

  // 2. CDF → remap LUT. Subtract the CDF minimum so the darkest used level maps
  //    to 0 (standard histogram-equalization normalization).
  const lut = new Uint8Array(256)
  let cdf = 0
  let cdfMin = 0
  for (let v = 0; v < 256; v++) {
    cdf += hist[v]
    if (cdfMin === 0 && cdf > 0) cdfMin = cdf
    const denom = count - cdfMin || 1
    lut[v] = Math.max(0, Math.min(255, Math.round(((cdf - cdfMin) / denom) * 255)))
  }

  // 3. Apply: scale RGB by remapped/original luminance to keep hue.
  for (let i = 0; i < n; i += 4) {
    if (data[i + 3] === 0) continue
    const l = lum(data[i], data[i + 1], data[i + 2])
    const nl = lut[Math.round(l)]
    const ratio = l > 0 ? nl / l : 0
    data[i] = data[i] * ratio
    data[i + 1] = data[i + 1] * ratio
    data[i + 2] = data[i + 2] * ratio
  }
}
