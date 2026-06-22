import * as React from 'react'
import { Toaster, toast } from 'toolbox'

// The Toaster is a mount-once region; toasts are triggered imperatively with
// `toast()`. We fire a few on mount with duration:Infinity so the static
// capture shows real, themed toasts. `theme="dark"` overrides the component's
// next-themes default (it spreads props after its own theme prop).
export function Toasts() {
  React.useEffect(() => {
    toast.success('Changes saved', { description: 'Your project was deployed.', duration: Infinity })
    toast.error('Build failed', { description: 'Check the logs for details.', duration: Infinity })
    toast('Event scheduled', { description: 'Friday, June 26 at 5:00 PM', duration: Infinity })
  }, [])
  return (
    <div
      className="dark"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--background)',
        color: 'var(--foreground)',
        colorScheme: 'dark',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <Toaster theme="dark" position="top-center" expand richColors />
      <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
        Toast region — triggered with toast()
      </span>
    </div>
  )
}
