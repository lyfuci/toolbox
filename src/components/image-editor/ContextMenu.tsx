import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Lightweight contextual menu, positioned at screen-fixed coordinates. The
 * caller is responsible for state: track an open `{ x, y, items }` and pass
 * `onClose` to hide. ESC + outside-click + window-blur all dismiss.
 *
 * Item shape mirrors MenuBar's MenuAction — same label / shortcut / onClick
 * / disabled trio. `{ sep: true }` inserts a visual separator.
 */
export type ContextMenuItem =
  | {
      id: string
      label: string
      shortcut?: string
      onClick?: () => void
      disabled?: boolean
      danger?: boolean
    }
  | { sep: true }

type Props = {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
  /** Optional header label shown above the items (e.g., layer name). */
  header?: ReactNode
}

export function ContextMenu({ x, y, items, onClose, header }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onBlur = () => onClose()
    // Defer the down-listener attach by one tick so the right-click event
    // that opened this menu doesn't immediately close it via this handler.
    const t = setTimeout(() => window.addEventListener('mousedown', onDown), 0)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [onClose])

  // Clamp into viewport so a click near the edge doesn't open the menu off-screen.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768
  // Menus are ~220px wide × variable; defer to the actual rendered height
  // via ref-based correction would be nicer, but this static clamp is
  // enough to avoid the common "right-click in bottom-right" overflow.
  const left = Math.min(x, vw - 240)
  const top = Math.min(y, vh - Math.min(40 + items.length * 28, 400))

  return (
    <div
      ref={ref}
      className="pf-context-menu"
      style={{ position: 'fixed', left, top, zIndex: 1000 }}
    >
      {header && (
        <div className="pf-context-menu-header">
          {header}
        </div>
      )}
      {items.map((item, i) => {
        if ('sep' in item) {
          return <div key={`sep-${i}`} className="pf-context-menu-sep" />
        }
        return (
          <button
            key={item.id}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return
              item.onClick?.()
              onClose()
            }}
            className={`pf-context-menu-item ${item.danger ? 'pf-context-menu-danger' : ''}`}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="pf-context-menu-shortcut">{item.shortcut}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
