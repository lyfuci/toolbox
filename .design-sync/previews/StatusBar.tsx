import * as React from 'react'
import { StatusBar } from 'toolbox'

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
    <Frame>
      <StatusBar
        width={1920}
        height={1080}
        zoom={1}
        tool="brush"
        cursor={{ x: 642, y: 318 }}
        selection={{ x: 100, y: 120, w: 480, h: 260 }}
        layerCount={5}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        onZoomReset={() => {}}
      />
    </Frame>
  )
}
