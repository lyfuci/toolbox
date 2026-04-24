import type { Adjustments } from './types'

/** Build a CSS filter string from adjustment sliders, or 'none' if all identity. */
export function filterString(a: Adjustments): string {
  const parts: string[] = []
  if (a.brightness !== 100) parts.push(`brightness(${a.brightness}%)`)
  if (a.contrast !== 100) parts.push(`contrast(${a.contrast}%)`)
  if (a.saturation !== 100) parts.push(`saturate(${a.saturation}%)`)
  if (a.hue !== 0) parts.push(`hue-rotate(${a.hue}deg)`)
  if (a.sepia !== 0) parts.push(`sepia(${a.sepia}%)`)
  if (a.invert !== 0) parts.push(`invert(${a.invert}%)`)
  if (a.grayscale !== 0) parts.push(`grayscale(${a.grayscale}%)`)
  if (a.blur !== 0) parts.push(`blur(${a.blur}px)`)
  return parts.length ? parts.join(' ') : 'none'
}
