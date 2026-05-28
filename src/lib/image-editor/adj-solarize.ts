import type { SolarizeParams } from './types'
/**
 * Solarize (PS Filter > Stylize > Solarize) — inverts the channels of any pixel
 * brighter than a threshold, producing the classic "blend of negative and
 * positive" look. PS hard-codes the threshold at the 50% midpoint; we expose it
 * so the result is tunable, defaulting to 128. Per-pixel, no neighbourhood, so
 * it rides the `applyAdjustment(data, params)` shape.
 */

export const DEFAULT_SOLARIZE: SolarizeParams = { kind: 'solarize', threshold: 128 }

export function applySolarize(data: Uint8ClampedArray, params: SolarizeParams): void {
  const t = params.threshold
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > t) data[i] = 255 - data[i]
    if (data[i + 1] > t) data[i + 1] = 255 - data[i + 1]
    if (data[i + 2] > t) data[i + 2] = 255 - data[i + 2]
  }
}
