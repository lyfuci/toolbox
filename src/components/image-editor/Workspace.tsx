import { type ReactNode } from 'react'

/**
 * Center workspace — checkerboard background reminiscent of PS, scrolls if
 * the canvas is bigger than the viewport. Centers its child via flexbox.
 */
export function Workspace({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex flex-1 items-center justify-center overflow-auto p-6"
      style={{
        backgroundColor: 'oklch(0.18 0.005 285)',
        backgroundImage:
          'linear-gradient(45deg, oklch(0.22 0.005 285) 25%, transparent 25%), linear-gradient(-45deg, oklch(0.22 0.005 285) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, oklch(0.22 0.005 285) 75%), linear-gradient(-45deg, transparent 75%, oklch(0.22 0.005 285) 75%)',
        backgroundSize: '16px 16px',
        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
      }}
    >
      <div className="rounded shadow-lg ring-1 ring-black/20">{children}</div>
    </div>
  )
}
