import * as React from 'react'
import { Separator } from 'toolbox'

function Frame({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="dark"
      style={{
        background: 'var(--background)',
        color: 'var(--foreground)',
        colorScheme: 'dark',
        padding: 24,
        maxWidth: 360,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function Horizontal() {
  return (
    <Frame>
      <div>
        <h4 style={{ fontWeight: 600, margin: 0, fontSize: 15 }}>Radix Primitives</h4>
        <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: '4px 0 0' }}>
          An open-source UI component library.
        </p>
      </div>
      <Separator style={{ margin: '16px 0' }} />
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 14 }}>
        <span>Blog</span>
        <Separator orientation="vertical" style={{ height: 16, margin: '0 12px' }} />
        <span>Docs</span>
        <Separator orientation="vertical" style={{ height: 16, margin: '0 12px' }} />
        <span>Source</span>
      </div>
    </Frame>
  )
}
