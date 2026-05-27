import { normalizeRect } from './hit'
import type { EditorState, Point, Rect } from './types'

/**
 * Selection-state transforms used by the Select menu. All return a new partial
 * EditorState the caller can merge with the current state via `history.set`.
 * None of these mutate; none reach beyond `state.selection*` plus the
 * `lastSelection*` snapshot.
 *
 * Modify > Expand / Contract operate on the selection's bounding box only —
 * polygon paths (Lasso) are simplified to their bbox first, since the
 * proper polygon-offset algorithm is large enough to deserve its own PR.
 * v1 trades that fidelity for predictable behaviour.
 *
 * Feather is NOT a geometry transform — it lives on `state.selectionFeather`
 * and is reapplied when the selection is consumed (Fill / Stroke / Adjustment).
 * These ops therefore never touch it; the polygon they return is the crisp
 * shape the boolean ops and feather both build on.
 */

/** Build a snapshot of the current selection so Reselect can restore it. */
function snapshotSelection(state: EditorState): {
  lastSelection: Rect | undefined
  lastSelectionPath: Point[] | undefined
  lastSelectionInverse: boolean | undefined
} {
  return {
    lastSelection: state.selection,
    lastSelectionPath: state.selectionPath,
    lastSelectionInverse: state.selectionInverse,
  }
}

/**
 * Deselect — clear the active selection, but snapshot it first so a
 * subsequent Reselect can bring it back.
 */
export function deselect(state: EditorState): Partial<EditorState> {
  if (!state.selection && !state.selectionPath) return {}
  return {
    ...snapshotSelection(state),
    selection: undefined,
    selectionPath: undefined,
    selectionInverse: undefined,
  }
}

/**
 * Select All — bbox selection covering the entire canvas. Replaces any
 * existing path, drops the inverse flag, snapshots the prior selection.
 * `previewDims` are the preview-canvas dimensions (post-rotation, post-crop).
 */
export function selectAll(
  state: EditorState,
  previewDims: { w: number; h: number },
): Partial<EditorState> {
  return {
    ...snapshotSelection(state),
    selection: { x: 0, y: 0, w: previewDims.w, h: previewDims.h },
    selectionPath: undefined,
    selectionInverse: undefined,
  }
}

/** Reselect — restore the previously-deselected selection, if any. */
export function reselect(state: EditorState): Partial<EditorState> {
  const { lastSelection, lastSelectionPath, lastSelectionInverse } = state
  if (!lastSelection && !lastSelectionPath) return {}
  return {
    selection: lastSelection,
    selectionPath: lastSelectionPath,
    selectionInverse: lastSelectionInverse,
    // Keep last* untouched so the user can Deselect→Reselect→Deselect→Reselect.
  }
}

/**
 * Inverse — toggle the inversion flag. Renderer / clip-bake honor the flag
 * to flip "paint inside selection" into "paint outside selection". Only
 * meaningful when a selection is set; for an unset selection, this would
 * mean "select the whole canvas" — handled by promoting to selectAll.
 */
export function inverseSelection(
  state: EditorState,
  previewDims: { w: number; h: number },
): Partial<EditorState> {
  if (!state.selection && !state.selectionPath) {
    // No selection → invert == select all (PS does this).
    return selectAll(state, previewDims)
  }
  return { selectionInverse: !state.selectionInverse }
}

/**
 * Expand the selection outward by `px` preview-canvas pixels. Operates on
 * the bbox; any polygon selectionPath is dropped (its bbox is what gets
 * expanded). Clamped at canvas bounds so the result stays representable.
 */
export function expandSelection(
  state: EditorState,
  px: number,
  previewDims: { w: number; h: number },
): Partial<EditorState> {
  if (!state.selection && !state.selectionPath) return {}
  const bbox = bboxOfCurrentSelection(state)
  if (!bbox) return {}
  const nx = Math.max(0, bbox.x - px)
  const ny = Math.max(0, bbox.y - px)
  const nw = Math.min(previewDims.w - nx, bbox.w + 2 * px)
  const nh = Math.min(previewDims.h - ny, bbox.h + 2 * px)
  if (nw <= 0 || nh <= 0) return {}
  return {
    selection: { x: nx, y: ny, w: nw, h: nh },
    selectionPath: undefined,
  }
}

/**
 * Contract the selection inward by `px` preview-canvas pixels. Returns no
 * change when the contraction would collapse the selection to zero area;
 * caller can detect that and surface a toast.
 */
export function contractSelection(
  state: EditorState,
  px: number,
): Partial<EditorState> {
  if (!state.selection && !state.selectionPath) return {}
  const bbox = bboxOfCurrentSelection(state)
  if (!bbox) return {}
  const nw = bbox.w - 2 * px
  const nh = bbox.h - 2 * px
  if (nw <= 0 || nh <= 0) {
    // Collapses to nothing — clear instead, snapshotting for Reselect.
    return {
      lastSelection: state.selection,
      lastSelectionPath: state.selectionPath,
      lastSelectionInverse: state.selectionInverse,
      selection: undefined,
      selectionPath: undefined,
      selectionInverse: undefined,
    }
  }
  return {
    selection: { x: bbox.x + px, y: bbox.y + px, w: nw, h: nh },
    selectionPath: undefined,
  }
}

function bboxOfCurrentSelection(state: EditorState): Rect | null {
  const path = state.selectionPath
  if (path && path.length >= 3) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of path) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }
  if (state.selection) return normalizeRect(state.selection)
  return null
}
