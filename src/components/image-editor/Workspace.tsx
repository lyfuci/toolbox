import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'

export type WorkspaceHandle = {
  /** Bounding rect of the inner wrapper (used by the page for zoom-at-point math). */
  getWrapperRect: () => DOMRect | null
}

type Props = {
  zoom: number
  pan: { x: number; y: number }
  setPan: (pan: { x: number; y: number }) => void
  /** True while Space is held — workspace handles drag-to-pan. */
  panMode: boolean
  /** Cmd/Ctrl + wheel callback. (clientX, clientY, factor). */
  onWheelZoom?: (clientX: number, clientY: number, factor: number) => void
  /** A file dragged into the workspace from the desktop. */
  onDropFile?: (file: File) => void
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
export const Workspace = forwardRef<WorkspaceHandle, Props>(function Workspace(
  { zoom, pan, setPan, panMode, onWheelZoom, onDropFile, children },
  ref,
) {
  const outerRef = useRef<HTMLDivElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<
    | { startX: number; startY: number; startPan: { x: number; y: number }; livePan: { x: number; y: number } }
    | null
  >(null)
  const [dragOver, setDragOver] = useState(false)

  const effectivePan = drag?.livePan ?? pan

  useImperativeHandle(
    ref,
    () => ({
      getWrapperRect: () => wrapperRef.current?.getBoundingClientRect() ?? null,
    }),
    [],
  )

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

  // Cmd/Ctrl + wheel = zoom at cursor. Use a non-passive native listener so we
  // can preventDefault (React's onWheel is passive in newer React).
  useEffect(() => {
    const el = outerRef.current
    if (!el || !onWheelZoom) return
    const handler = (e: WheelEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      // Smooth multiplicative factor — consistent at any wheel-step granularity.
      const factor = Math.exp(-e.deltaY / 200)
      onWheelZoom(e.clientX, e.clientY, factor)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [onWheelZoom])

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!onDropFile) return
    if (Array.from(e.dataTransfer.items).some((i) => i.kind === 'file')) {
      e.preventDefault()
      setDragOver(true)
    }
  }
  const onDragLeave = () => setDragOver(false)
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!onDropFile) return
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) onDropFile(f)
  }

  const dragging = drag !== null

  return (
    <div
      ref={outerRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="relative flex flex-1 items-center justify-center overflow-hidden"
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
        ref={wrapperRef}
        className="rounded shadow-lg ring-1 ring-black/20"
        style={{
          transform: `translate(${effectivePan.x}px, ${effectivePan.y}px) scale(${zoom})`,
          transformOrigin: 'center',
          transition: dragging ? 'none' : 'transform 90ms ease-out',
        }}
      >
        {children}
      </div>

      {/* Drop overlay — a translucent hint when dragging an image file in. */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/10 ring-2 ring-inset ring-primary/60">
          <span className="rounded bg-background/80 px-3 py-1 text-xs font-medium">
            Drop image to add as a new layer
          </span>
        </div>
      )}
    </div>
  )
})
