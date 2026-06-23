import * as React from 'react'
import { AdjustPanel } from 'toolbox'

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
        width: 280,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function Default() {
  return (
    <Frame>
      <AdjustPanel
        transforms={{ rotation: 0, flipH: false, flipV: false }}
        setTransforms={() => {}}
        adjust={{
          brightness: 110,
          contrast: 95,
          saturation: 130,
          grayscale: 0,
          blur: 0,
          hue: 15,
          sepia: 0,
          invert: 0,
        }}
        setAdjust={() => {}}
      />
    </Frame>
  )
}
