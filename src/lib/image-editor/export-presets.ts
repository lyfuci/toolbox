import type { OutputFormat } from './types'

/**
 * Export Preset — a saved combination of format + quality + scale +
 * filename pattern so the user can re-export with one click instead of
 * walking through Save-for-Web each time.
 *
 * User-created presets are persisted to localStorage via
 * `loadExportPresets` / `saveExportPresets`; the built-in starter set in
 * `BUILTIN_EXPORT_PRESETS` is always available regardless of what's
 * stored (the editor merges built-ins + persisted at render time).
 *
 * Capacity is capped at 10 to keep the menu manageable — `saveExportPresets`
 * silently truncates anything beyond that.
 */
export type ExportPreset = {
  id: string
  name: string
  format: OutputFormat
  /** 0..100 quality. Ignored for PNG (lossless). */
  quality: number
  /** Resolution multiplier — 1 = native, 2 = 2x for Retina, etc. */
  scale: 0.5 | 1 | 2 | 3
  /**
   * Filename pattern. Supported placeholders:
   *   {name}  — current document stem (no extension)
   *   {scale} — preset's scale (e.g. "2")
   *   {ext}   — file extension matching format ("png" | "jpg" | "webp")
   * Default: `"{name}@{scale}x.{ext}"`.
   */
  filenamePattern: string
}

export const DEFAULT_FILENAME_PATTERN = '{name}@{scale}x.{ext}'

/** Hard cap on stored presets (built-ins excluded from this count). */
export const MAX_EXPORT_PRESETS = 10

const STORAGE_KEY = 'pf-export-presets'

/** Read user-defined presets from localStorage. Returns [] on any parse failure. */
export function loadExportPresets(): ExportPreset[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidPreset).slice(0, MAX_EXPORT_PRESETS)
  } catch {
    return []
  }
}

/** Persist user-defined presets. Overwrites the previous list. Truncates
 *  to MAX_EXPORT_PRESETS so the menu stays bounded. */
export function saveExportPresets(list: ExportPreset[]): void {
  if (typeof window === 'undefined') return
  try {
    const trimmed = list.slice(0, MAX_EXPORT_PRESETS)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Quota / serialization error — silent. Session keeps the list in
    // memory; only persistence fails.
  }
}

/**
 * Substitute {name}, {scale}, {ext} placeholders in `pattern`. Unknown
 * placeholders are left as-is — pattern authors get a visible cue rather
 * than a silent truncation.
 */
export function applyFilenamePattern(
  pattern: string,
  args: { name: string; scale: number; ext: string },
): string {
  return pattern
    .replace(/\{name\}/g, args.name)
    .replace(/\{scale\}/g, String(args.scale))
    .replace(/\{ext\}/g, args.ext)
}

function isValidPreset(v: unknown): v is ExportPreset {
  const p = v as Partial<ExportPreset> | null
  if (!p) return false
  if (typeof p.id !== 'string' || typeof p.name !== 'string') return false
  if (p.format !== 'png' && p.format !== 'jpeg' && p.format !== 'webp') {
    return false
  }
  if (typeof p.quality !== 'number' || p.quality < 0 || p.quality > 100) {
    return false
  }
  if (p.scale !== 0.5 && p.scale !== 1 && p.scale !== 2 && p.scale !== 3) {
    return false
  }
  if (typeof p.filenamePattern !== 'string') return false
  return true
}

/** Built-in starter set. Always present, regardless of what the user has
 *  stored. The editor concatenates these with `loadExportPresets()` at
 *  render time, so menu order is built-ins → user. */
export const BUILTIN_EXPORT_PRESETS: ExportPreset[] = [
  {
    id: 'builtin-png',
    name: 'PNG',
    format: 'png',
    quality: 100,
    scale: 1,
    filenamePattern: DEFAULT_FILENAME_PATTERN,
  },
  {
    id: 'builtin-jpeg-85',
    name: 'JPEG 85',
    format: 'jpeg',
    quality: 85,
    scale: 1,
    filenamePattern: DEFAULT_FILENAME_PATTERN,
  },
  {
    id: 'builtin-webp-80',
    name: 'WebP 80',
    format: 'webp',
    quality: 80,
    scale: 1,
    filenamePattern: DEFAULT_FILENAME_PATTERN,
  },
]
