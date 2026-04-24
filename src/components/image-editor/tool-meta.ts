import type { Tool } from '@/lib/image-editor/types'

/**
 * Tools rendered in the palette but not implemented end-to-end. Clicking a
 * stub tool surfaces a toast and leaves the active tool unchanged.
 *
 * Kept in sync by hand with `ToolsPalette.tsx` — small enough that the
 * duplication isn't worth a build-time dance.
 */
export const STUB_TOOLS: ReadonlySet<Tool> = new Set<Tool>([
  'lasso',
  'polyLasso',
  'wand',
  'spotHeal',
  'stamp',
  'historyBrush',
  'pen',
  'arrowPath',
  'frame',
  'note',
])
