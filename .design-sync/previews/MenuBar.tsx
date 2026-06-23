import * as React from 'react'
import { MenuBar } from 'toolbox'

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
      <MenuBar
        handlers={{
          canUndo: true,
          canRedo: false,
          canPaste: true,
          recentFiles: [{ name: 'sunset-beach.jpg' }, { name: 'logo-final.png' }],
          showGrid: true,
          showRulers: false,
          showGuides: true,
          hasGuides: true,
          undo: () => {},
          redo: () => {},
          open: () => {},
          save: () => {},
          exportPng: () => {},
          newDocument: () => {},
          zoomIn: () => {},
          zoomOut: () => {},
          openAdjustment: () => {},
          openFilter: () => {},
          openLayerStyle: () => {},
          duplicateLayer: () => {},
          deleteLayer: () => {},
        }}
      />
    </Frame>
  )
}
