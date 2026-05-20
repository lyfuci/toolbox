/**
 * Recent files — last N opened images, persisted in localStorage so the
 * editor can re-open them from the File menu without a fresh file pick.
 *
 * Storage shape: a single JSON array of `{ name, dataUrl, addedAt,
 * thumbnail? }`. The full dataUrl is what gets re-loaded; the optional
 * thumbnail is a 96-px JPEG preview shown in the menu. Capped at 5
 * entries; LRU eviction when full.
 *
 * Quota: localStorage is typically ~5MB per origin. Big PNGs blow past
 * that easily, so writes that throw QuotaExceededError silently drop
 * the oldest entry and retry once.
 */
const STORAGE_KEY = 'pf-recent-files'
const MAX_ENTRIES = 5

export type RecentFile = {
  name: string
  /** Full original-resolution dataUrl — used for re-open. */
  dataUrl: string
  addedAt: string
  /** ~96px square JPEG preview (much smaller than dataUrl). */
  thumbnail?: string
}

export function loadRecentFiles(): RecentFile[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValid).slice(0, MAX_ENTRIES)
  } catch {
    return []
  }
}

export function addRecentFile(entry: Omit<RecentFile, 'addedAt'>): RecentFile[] {
  if (typeof window === 'undefined') return []
  const fresh: RecentFile = { ...entry, addedAt: new Date().toISOString() }
  let list = loadRecentFiles()
  // Dedupe by name — re-opening the same file moves it to the top.
  list = list.filter((e) => e.name !== fresh.name)
  list.unshift(fresh)
  list = list.slice(0, MAX_ENTRIES)
  trySave(list)
  return list
}

export function clearRecentFiles(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore — clearing should not surface errors to the user.
  }
}

function trySave(list: RecentFile[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Quota exceeded — drop oldest until it fits or we're empty.
    while (list.length > 1) {
      list.pop()
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
        return
      } catch {
        // keep shrinking
      }
    }
    // Even a single entry doesn't fit — silently drop persistence for now.
  }
}

function isValid(v: unknown): v is RecentFile {
  const e = v as Partial<RecentFile> | null
  return (
    !!e &&
    typeof e.name === 'string' &&
    typeof e.dataUrl === 'string' &&
    typeof e.addedAt === 'string'
  )
}

/**
 * Render an image to a small JPEG dataUrl for use as a thumbnail. Letter-
 * boxed onto a square so all thumbnails are the same dimensions.
 */
export function makeThumbnail(img: HTMLImageElement, size = 96): string | null {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')
  if (!ctx) return null
  const fit = Math.max(img.naturalWidth, img.naturalHeight, 1)
  const dw = (img.naturalWidth * size) / fit
  const dh = (img.naturalHeight * size) / fit
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, size, size)
  try {
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh)
    return c.toDataURL('image/jpeg', 0.6)
  } catch {
    return null
  }
}
