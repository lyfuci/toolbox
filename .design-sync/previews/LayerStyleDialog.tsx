import * as React from 'react'
import { LayerStyleDialog } from 'toolbox'

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
      <LayerStyleDialog
        open
        initialKind="dropShadow"
        initial={[
          {
            kind: 'dropShadow',
            enabled: true,
            color: '#000000',
            opacity: 75,
            blend: 'multiply',
            distance: 8,
            angle: 135,
            size: 12,
          },
          {
            kind: 'stroke',
            enabled: true,
            color: '#22d3ee',
            opacity: 100,
            blend: 'normal',
            width: 3,
            position: 'outside',
          },
        ]}
        onApply={() => {}}
        onCancel={() => {}}
      />
    </Frame>
  )
}
