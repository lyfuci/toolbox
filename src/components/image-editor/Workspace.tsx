import {
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'

type Props = {
  zoom: number
  pan: { x: number; y: number }
  setPan: (pan: { x: number; y: number }) => void
  /** True while Space is held — workspace handles drag-to-pan. */
  panMode: boolean
  children: ReactNode
}

/**
 * Center workspace — checkerboard background reminiscent of PS, scrolls if
 * the canvas is bigger than the viewport. Owns the zoom + pan transform
 * applied to its child wrapper, and handles pan-drag when Space is held.
 *
 * Mouse events bubble through to the Canvas under normal conditions; when
 * panMode is on, Canvas's mousedown returns early and Workspace's drag
 * logic runs against the bubbled event.
 */
export function Workspace({ zoom, pan, setPan, panMode, children }: Props) {
  // Active-drag state lives in React state (not a ref) so we can read it
  // during render to set transitions / cursor.
  const [drag, setDrag] = useState<
    | { startX: number; startY: number; startPan: { x: number; y: number }; livePan: { x: number; y: number } }
    | null
  >(null)

  const effectivePan = drag?.livePan ?? pan

  const onMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!panMode) return
    e.preventDefault()
    setDrag({ startX: e.clientX, startY: e.clientY, startPan: pan, livePan: pan })
  }

  const onMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    setDrag({ ...drag, livePan: { x: drag.startPan.x + dx, y: drag.startPan.y + dy } })
  }

  const onMouseUp = () => {
    if (drag) setPan(drag.livePan)
    setDrag(null)
  }

  const dragging = drag !== null

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      className="flex flex-1 items-center justify-center overflow-hidden"
      style={{
        cursor: panMode ? (dragging ? 'grabbing' : 'grab') : undefined,
        backgroundColor: 'oklch(0.18 0.005 285)',
        backgroundImage:
          'linear-gradient(45deg, oklch(0.22 0.005 285) 25%, transparent 25%), linear-gradient(-45deg, oklch(0.22 0.005 285) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, oklch(0.22 0.005 285) 75%), linear-gradient(-45deg, transparent 75%, oklch(0.22 0.005 285) 75%)',
        backgroundSize: '16px 16px',
        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
      }}
    >
      <div
        className="rounded shadow-lg ring-1 ring-black/20"
        style={{
          transform: `translate(${effectivePan.x}px, ${effectivePan.y}px) scale(${zoom})`,
          transformOrigin: 'center',
          transition: dragging ? 'none' : 'transform 90ms ease-out',
        }}
      >
        {children}
      </div>
    </div>
  )
}
