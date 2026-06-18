import type { LayerColorTag } from './types'

/**
 * PS-style layer color labels → CSS color, plus the ordered list for the
 * picker. Kept in lib (not the LayersPanel component) so it can be imported by
 * both the panel and any future consumer without tripping react-refresh's
 * "components-only export" rule.
 */
export const LAYER_TAG_COLORS: Record<LayerColorTag, string> = {
  red: '#d9433c',
  orange: '#e08a3c',
  yellow: '#d7b13a',
  green: '#4f9d52',
  blue: '#3a8cff',
  violet: '#8a63d2',
  gray: '#8a8f98',
}

export const LAYER_TAGS: LayerColorTag[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'violet',
  'gray',
]
