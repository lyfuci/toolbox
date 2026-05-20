import type { EditorState } from './types'

/**
 * Autosave — periodic localStorage snapshot of the current project so the
 * user can recover from a crash / refresh. The snapshot is keyed under
 * `pf-autosave` and stores the serialized project JSON (same shape that
 * Save Project produces, plus an `autosavedAt` timestamp).
 *
 * Storage shape (JSON): { version, source: {name, dataUrl}, state,
 * autosavedAt }
 *
 * Constraints:
 *  - localStorage quota ~5MB; big images blow past it. Failures are
 *    silently swallowed — autosave is best-effort, not a guarantee.
 *  - Snapshots older than `MAX_AGE_MS` aren't offered for restore
 *    (a stale 3-week-old snapshot just clutters startup with a prompt).
 */
const KEY = 'pf-autosave'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export type AutosaveSnapshot = {
  version: 1
  source: { name: string; dataUrl: string }
  state: EditorState
  autosavedAt: string
}

export function saveAutosave(snapshot: Omit<AutosaveSnapshot, 'version' | 'autosavedAt'>): void {
  if (typeof window === 'undefined') return
  const full: AutosaveSnapshot = {
    ...snapshot,
    version: 1,
    autosavedAt: new Date().toISOString(),
  }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(full))
  } catch {
    // Quota exceeded or stringify error — autosave silently no-ops.
  }
}

export function loadAutosave(): AutosaveSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AutosaveSnapshot>
    if (
      !parsed ||
      parsed.version !== 1 ||
      !parsed.source ||
      typeof parsed.source.dataUrl !== 'string' ||
      typeof parsed.source.name !== 'string' ||
      !parsed.state ||
      typeof parsed.autosavedAt !== 'string'
    ) {
      return null
    }
    const ageMs = Date.now() - Date.parse(parsed.autosavedAt)
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > MAX_AGE_MS) return null
    return parsed as AutosaveSnapshot
  } catch {
    return null
  }
}

export function clearAutosave(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
