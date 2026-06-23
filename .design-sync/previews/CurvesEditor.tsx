import * as React from 'react'
import { CurvesEditor } from 'toolbox'

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
    <Frame style={{ width: 288 }}>
      <CurvesEditor
        points={[
          { x: 0, y: 0 },
          { x: 64, y: 48 },
          { x: 128, y: 150 },
          { x: 192, y: 210 },
          { x: 255, y: 255 },
        ]}
        tint="#f87171"
        onChange={() => {}}
      />
    </Frame>
  )
}
