import { useCallback, useEffect, useState } from 'react'

/**
 * Undo/redo stack hook around any serialisable state.
 *
 * - `set(value)` pushes the previous state onto the undo stack and clears redo.
 * - `replace(value)` mutates without recording history (use during an
 *   in-progress drag where every mousemove would otherwise pollute history).
 * - `undo()` / `redo()` pop accordingly.
 *
 * Bound globally to Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z (or Ctrl+Y) by default,
 * but skips text inputs / textareas so users can keep using native undo there.
 */
export function useHistoryState<T>(initial: T) {
  const [present, setPresent] = useState<T>(initial)
  const [past, setPast] = useState<T[]>([])
  const [future, setFuture] = useState<T[]>([])

  const set = useCallback(
    (next: T) => {
      setPast((p) => [...p, present])
      setFuture([])
      setPresent(next)
    },
    [present],
  )

  const replace = useCallback((next: T) => {
    setPresent(next)
  }, [])

  const undo = useCallback(() => {
    if (past.length === 0) return
    const prev = past[past.length - 1]
    setPast((p) => p.slice(0, -1))
    setFuture((f) => [...f, present])
    setPresent(prev)
  }, [past, present])

  const redo = useCallback(() => {
    if (future.length === 0) return
    const next = future[future.length - 1]
    setFuture((f) => f.slice(0, -1))
    setPast((p) => [...p, present])
    setPresent(next)
  }, [future, present])

  const reset = useCallback((next: T) => {
    setPast([])
    setFuture([])
    setPresent(next)
  }, [])

  /**
   * Jump to an arbitrary index in the chronological [past..present..future]
   * stack. Index 0 = oldest past entry; index `past.length` = present.
   * Out-of-range indices clamp. Used by the History panel.
   */
  const jumpTo = useCallback(
    (index: number) => {
      const all = [...past, present, ...future.slice().reverse()]
      const clamped = Math.max(0, Math.min(all.length - 1, index))
      const newPast = all.slice(0, clamped)
      const newPresent = all[clamped]
      // Future is everything AFTER the new present, in reverse chronological
      // order (so pop() picks the most-recently-undone entry first).
      const newFuture = all.slice(clamped + 1).reverse()
      setPast(newPast)
      setPresent(newPresent)
      setFuture(newFuture)
    },
    [past, present, future],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  return {
    state: present,
    set,
    replace,
    undo,
    redo,
    reset,
    jumpTo,
    /** Past-entries-then-present-then-undone-redoable count. */
    totalLength: past.length + 1 + future.length,
    /** Position of `present` in the [past..present..future] timeline. */
    currentIndex: past.length,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  }
}
