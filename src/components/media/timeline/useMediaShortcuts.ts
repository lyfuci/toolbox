import { useEffect, useRef } from 'react'

/**
 * Global keyboard shortcuts for the Media editor, DaVinci-Resolve-aligned but
 * browser-safe. Subscribes ONCE and reads the latest handlers through a ref, so
 * callers can pass fresh closures every render without re-binding the listener.
 *
 * Editable targets (INPUT/TEXTAREA/SELECT/contentEditable) are ignored so typing
 * in a field (page range, etc.) never triggers transport. Keys that would scroll
 * the page (Space, arrows, Home/End) call preventDefault. `?` / `F` / `Escape`
 * fire even without content loaded; everything else is gated on `enabled`.
 */
export type MediaShortcutHandlers = {
  /** Transport/editing keys are live only when there is media loaded. */
  enabled: boolean
  /** Whether the editor is currently in fullscreen (so Escape can exit). */
  focused: boolean
  onPlayPause: () => void
  onStepFrame: (dir: 1 | -1) => void
  onStepSecond: (dir: 1 | -1) => void
  onStepClipBoundary: (dir: 1 | -1) => void
  onGoStart: () => void
  onGoEnd: () => void
  onZoom: (dir: 1 | -1) => void
  onZoomFit: () => void
  onSplit: () => void
  onDelete: () => void
  onRippleDelete: () => void
  onToggleSnap: () => void
  onMarkIn: () => void
  onMarkOut: () => void
  onGotoIn: () => void
  onGotoOut: () => void
  onMarkClip: () => void
  onClearInOut: () => void
  onAddMarker: () => void
  onUndo: () => void
  onRedo: () => void
  onToggleFullscreen: () => void
  onExitFullscreen: () => void
  onToggleHelp: () => void
}

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function useMediaShortcuts(handlers: MediaShortcutHandlers) {
  const ref = useRef(handlers)
  // Sync latest handlers into the ref after each render (not during) so the
  // one-time listener below always calls the freshest closures.
  useEffect(() => {
    ref.current = handlers
  })

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const h = ref.current
      if (isEditable(e.target)) return
      const mod = e.metaKey || e.ctrlKey

      // Help + fullscreen work regardless of loaded content.
      if (e.key === '?' && !mod && !e.altKey) {
        e.preventDefault()
        h.onToggleHelp()
        return
      }
      if (e.key === 'Escape') {
        if (h.focused) {
          e.preventDefault()
          h.onExitFullscreen()
        }
        return
      }
      if ((e.key === 'f' || e.key === 'F') && !mod && !e.altKey) {
        e.preventDefault()
        h.onToggleFullscreen()
        return
      }

      if (!h.enabled) return

      // Cmd/Ctrl+B = split at playhead (DaVinci "Razor"). Handled before the
      // blanket mod-combo drop below.
      if (mod && !e.altKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault()
        h.onSplit()
        return
      }
      // Alt/Opt+X = clear in & out points.
      if (e.altKey && !mod && (e.key === 'x' || e.key === 'X')) {
        e.preventDefault()
        h.onClearInOut()
        return
      }
      // Cmd/Ctrl+Z = undo, Shift+Cmd/Ctrl+Z = redo.
      if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        if (e.shiftKey) h.onRedo()
        else h.onUndo()
        return
      }
      // Leave the remaining Cmd/Ctrl/Alt combos to the browser/app for now.
      if (mod || e.altKey) return

      switch (e.key) {
        case ' ': // Space: play / pause. preventDefault also blocks the native
          // activation of any focused transport button (no double-toggle).
          e.preventDefault()
          h.onPlayPause()
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (e.shiftKey) h.onStepSecond(-1)
          else h.onStepFrame(-1)
          break
        case 'ArrowRight':
          e.preventDefault()
          if (e.shiftKey) h.onStepSecond(1)
          else h.onStepFrame(1)
          break
        case 'ArrowUp':
          e.preventDefault()
          h.onStepClipBoundary(-1)
          break
        case 'ArrowDown':
          e.preventDefault()
          h.onStepClipBoundary(1)
          break
        case 'Home':
          e.preventDefault()
          h.onGoStart()
          break
        case 'End':
          e.preventDefault()
          h.onGoEnd()
          break
        case '=':
        case '+':
          e.preventDefault()
          h.onZoom(1)
          break
        case '-':
        case '_':
          e.preventDefault()
          h.onZoom(-1)
          break
        case 'b':
        case 'B':
          e.preventDefault()
          h.onSplit()
          break
        case 'n':
        case 'N':
          e.preventDefault()
          h.onToggleSnap()
          break
        case 'Delete':
        case 'Backspace':
          e.preventDefault()
          if (e.shiftKey) h.onRippleDelete()
          else h.onDelete()
          break
        // Marking — lowercase = set, uppercase (Shift) = go to.
        case 'i':
          e.preventDefault()
          h.onMarkIn()
          break
        case 'I':
          e.preventDefault()
          h.onGotoIn()
          break
        case 'o':
          e.preventDefault()
          h.onMarkOut()
          break
        case 'O':
          e.preventDefault()
          h.onGotoOut()
          break
        case 'x':
          e.preventDefault()
          h.onMarkClip()
          break
        case 'm':
        case 'M':
          e.preventDefault()
          h.onAddMarker()
          break
        case 'Z': // Shift+Z = zoom timeline to fit.
          e.preventDefault()
          h.onZoomFit()
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
