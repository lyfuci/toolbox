import * as React from 'react'
import { PathsPanel } from 'toolbox'

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
  imageLayer: { id: 'image', kind: 'image', name: 'Background', visible: true, opacity: 100, blend: 'normal' },
  transforms: { rotation: 0, flipH: false, flipV: false },
  adjust: {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    grayscale: 0,
    blur: 0,
    hue: 0,
    sepia: 0,
    invert: 0,
  },
  selection: { x: 40, y: 30, w: 220, h: 160 },
  layers: [
    {
      id: 'path-leaf',
      kind: 'annotation',
      name: 'Leaf Outline',
      visible: true,
      opacity: 100,
      blend: 'normal',
      shape: {
        kind: 'path',
        closed: true,
        color: '#34d399',
        strokeWidth: 2,
        anchors: [
          { x: 20, y: 80, hout: { x: 10, y: -40 } },
          { x: 90, y: 20, hin: { x: -30, y: -10 }, hout: { x: 30, y: 10 } },
          { x: 160, y: 80, hin: { x: 10, y: -40 } },
          { x: 90, y: 150, hin: { x: 30, y: -10 }, hout: { x: -30, y: 10 } },
        ],
      },
    },
    {
      id: 'path-wave',
      kind: 'annotation',
      name: 'Signature Curve',
      visible: true,
      opacity: 100,
      blend: 'normal',
      shape: {
        kind: 'path',
        closed: false,
        color: '#60a5fa',
        strokeWidth: 2,
        anchors: [
          { x: 10, y: 60, hout: { x: 30, y: -40 } },
          { x: 80, y: 40, hin: { x: -20, y: 30 }, hout: { x: 20, y: -30 } },
          { x: 150, y: 70, hin: { x: -30, y: -30 } },
        ],
      },
    },
  ],
}

export function Default() {
  return (
    <Frame>
      <PathsPanel
        state={state as never}
        selectedId="path-leaf"
        onSelect={() => {}}
        onMakeWorkPath={() => {}}
        onMakeSelectionFromPath={() => {}}
      />
    </Frame>
  )
}
