import type { BrushOptions } from './types'

/**
 * Built-in brush presets. Each preset overwrites the editor's brushOptions
 * + strokeWidth when picked from the Brushes panel. User-created custom
 * presets are stored separately via `loadCustomBrushPresets` /
 * `saveCustomBrushPresets` (localStorage round-trip) and merged onto the
 * built-in list at render time.
 */
export type BrushPreset = {
  id: string
  name: string
  strokeWidth: number
  options: BrushOptions
  /** Optional thumbnail dataUrl for the panel (a small swatch of the tip
   *  silhouette). Lets the user identify imported tips at a glance.
   *  Identical to options.tipDataUrl in practice; stored separately so the
   *  panel can show a thumbnail without re-rendering the tip every frame. */
  thumbnailDataUrl?: string
}

const CUSTOM_KEY = 'pf-custom-brushes'

/** Read custom presets from localStorage. Returns [] on any parse failure. */
export function loadCustomBrushPresets(): BrushPreset[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CUSTOM_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidPreset)
  } catch {
    return []
  }
}

/** Persist custom presets. Overwrites the previous list. */
export function saveCustomBrushPresets(list: BrushPreset[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(list))
  } catch {
    // Quota / serialization error — silent. The user's session keeps the
    // list in memory; only persistence fails.
  }
}

function isValidPreset(v: unknown): v is BrushPreset {
  const p = v as Partial<BrushPreset> | null
  return !!p &&
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.strokeWidth === 'number' &&
    typeof p.options === 'object' &&
    p.options !== null &&
    typeof (p.options as BrushOptions).hardness === 'number'
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
