import * as React from 'react'
import { BrushesPanel } from 'toolbox'

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
        width: 300,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function Presets() {
  return (
    <Frame>
      <BrushesPanel
        current={{ strokeWidth: 12, options: { hardness: 0.9, spacing: 0.1, flow: 1, opacity: 1 } as never }}
        customPresets={[]}
        onPick={() => {}}
        onSaveCurrent={() => {}}
        onDeleteCustom={() => {}}
      />
    </Frame>
  )
}
