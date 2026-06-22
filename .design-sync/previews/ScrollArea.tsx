import * as React from 'react'
import { ScrollArea, Separator } from 'toolbox'

function Frame({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="dark"
      style={{
        background: 'var(--background)',
        color: 'var(--foreground)',
        colorScheme: 'dark',
        padding: 24,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

const tags = Array.from({ length: 24 }, (_, i) => `v1.2.0-beta.${24 - i}`)

export function Vertical() {
  return (
    <Frame>
      <ScrollArea
        type="always"
        style={{
          height: 220,
          width: 240,
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}
      >
        <div style={{ padding: '12px 16px' }}>
          <h4 style={{ fontWeight: 600, margin: '0 0 8px', fontSize: 14 }}>Tags</h4>
          {tags.map((t, i) => (
            <React.Fragment key={t}>
              {i > 0 && <Separator style={{ margin: '6px 0' }} />}
              <div style={{ fontSize: 14 }}>{t}</div>
            </React.Fragment>
          ))}
        </div>
      </ScrollArea>
    </Frame>
  )
}
