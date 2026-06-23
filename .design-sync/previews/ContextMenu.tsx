import * as React from 'react'
import { ContextMenu } from 'toolbox'

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
        minHeight: 320,
        position: 'relative',
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
      <ContextMenu
        x={16}
        y={16}
        header="Background copy"
        items={[
          { id: 'duplicate', label: 'Duplicate Layer', shortcut: 'Ctrl+J', onClick: () => {} },
          { id: 'rasterize', label: 'Rasterize Layer', onClick: () => {} },
          { id: 'blending', label: 'Blending Options…', onClick: () => {} },
          { sep: true },
          { id: 'merge', label: 'Merge Down', shortcut: 'Ctrl+E', onClick: () => {} },
          { id: 'flatten', label: 'Flatten Image', disabled: true, onClick: () => {} },
          { sep: true },
          { id: 'delete', label: 'Delete Layer', shortcut: 'Del', danger: true, onClick: () => {} },
        ]}
        onClose={() => {}}
      />
    </Frame>
  )
}
