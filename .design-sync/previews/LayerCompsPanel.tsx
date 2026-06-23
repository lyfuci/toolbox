import * as React from 'react'
import { LayerCompsPanel } from 'toolbox'

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

const state = {
  layerComps: [
    {
      id: 'lc-1',
      name: 'Hero Layout',
      createdAt: '2026-06-20T10:00:00Z',
      layers: [{}, {}, {}, {}],
      imageLayer: {},
    },
    {
      id: 'lc-2',
      name: 'Mobile Variant',
      createdAt: '2026-06-20T11:30:00Z',
      layers: [{}, {}],
      imageLayer: {},
    },
    {
      id: 'lc-3',
      name: 'Dark Mode',
      createdAt: '2026-06-21T09:15:00Z',
      layers: [{}, {}, {}],
      imageLayer: {},
    },
  ],
}

export function Default() {
  return (
    <Frame>
      <LayerCompsPanel
        state={state as never}
        onSaveComp={() => {}}
        onApplyComp={() => {}}
        onDeleteComp={() => {}}
      />
    </Frame>
  )
}
