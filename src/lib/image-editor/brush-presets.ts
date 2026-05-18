import type { BrushOptions } from './types'

/**
 * Built-in brush presets. Each preset overwrites the editor's brushOptions
 * + strokeWidth when picked from the Brushes panel. Custom user presets
 * (a localStorage round-trip + "save current" button) are deferred to v2.
 */
export type BrushPreset = {
  id: string
  name: string
  strokeWidth: number
  options: BrushOptions
}

export const BUILTIN_BRUSH_PRESETS: BrushPreset[] = [
  {
    id: 'hard-round-2',
    name: 'Hard Round 2',
    strokeWidth: 2,
    options: { hardness: 1, spacing: 0.1, flow: 1, opacity: 1 },
  },
  {
    id: 'hard-round-10',
    name: 'Hard Round 10',
    strokeWidth: 10,
    options: { hardness: 1, spacing: 0.1, flow: 1, opacity: 1 },
  },
  {
    id: 'soft-round-30',
    name: 'Soft Round 30',
    strokeWidth: 30,
    options: { hardness: 0.3, spacing: 0.25, flow: 0.6, opacity: 0.8 },
  },
  {
    id: 'soft-round-60',
    name: 'Soft Round 60',
    strokeWidth: 60,
    options: { hardness: 0.15, spacing: 0.25, flow: 0.4, opacity: 0.7 },
  },
  {
    id: 'spray-low-flow',
    name: 'Spray',
    strokeWidth: 40,
    options: { hardness: 0.05, spacing: 0.5, flow: 0.15, opacity: 1 },
  },
  {
    id: 'calligraphic',
    name: 'Calligraphic',
    strokeWidth: 14,
    options: { hardness: 0.9, spacing: 0.05, flow: 1, opacity: 1 },
  },
]
