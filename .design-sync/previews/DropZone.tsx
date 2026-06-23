import * as React from 'react'
import { DropZone } from 'toolbox'

function Frame({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  React.useEffect(() => {
    const el = document.documentElement
    el.classList.add('dark')
    return () => el.classList.remove('dark')
  }, [])
  return (
    <div
      style={{
        background: 'var(--background)',
        color: 'var(--foreground)',
        colorScheme: 'dark',
        padding: 16,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function Default() {
  return (
    <Frame style={{ width: 460 }}>
      <DropZone onFile={() => {}} />
    </Frame>
  )
}
